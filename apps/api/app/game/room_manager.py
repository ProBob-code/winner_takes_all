"""WebSocket game room manager for concurrent tournament matches."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from .lifelines import assign_lifelines, resolve_lifeline, lifeline_effect_to_dict

logger = logging.getLogger(__name__)


@dataclass
class PlayerConnection:
    user_id: str
    user_name: str
    websocket: object  # WebSocket instance
    score: int = 0
    lifelines: list[str] = field(default_factory=list)
    lifelines_used: list[str] = field(default_factory=list)
    connected: bool = True


@dataclass
class GameRoom:
    match_id: str
    tournament_id: str
    player1: PlayerConnection | None = None
    player2: PlayerConnection | None = None
    status: str = "waiting"  # waiting, ready, playing, finished
    current_turn: str | None = None  # user_id of whose turn it is
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_full(self) -> bool:
        return self.player1 is not None and self.player2 is not None

    def get_player(self, user_id: str) -> PlayerConnection | None:
        if self.player1 and self.player1.user_id == user_id:
            return self.player1
        if self.player2 and self.player2.user_id == user_id:
            return self.player2
        return None

    def get_opponent(self, user_id: str) -> PlayerConnection | None:
        if self.player1 and self.player1.user_id == user_id:
            return self.player2
        if self.player2 and self.player2.user_id == user_id:
            return self.player1
        return None


class GameRoomManager:
    """Singleton manager for all active game rooms.

    Handles multiple concurrent matches simultaneously.
    """

    def __init__(self):
        self.rooms: dict[str, GameRoom] = {}
        self._lock = asyncio.Lock()

    async def get_or_create_room(self, match_id: str, tournament_id: str) -> GameRoom:
        async with self._lock:
            if match_id not in self.rooms:
                self.rooms[match_id] = GameRoom(
                    match_id=match_id,
                    tournament_id=tournament_id,
                )
            return self.rooms[match_id]

    async def remove_room(self, match_id: str) -> None:
        async with self._lock:
            self.rooms.pop(match_id, None)

    def get_room(self, match_id: str) -> GameRoom | None:
        return self.rooms.get(match_id)

    @property
    def active_room_count(self) -> int:
        return len(self.rooms)

    async def join_room(
        self,
        match_id: str,
        tournament_id: str,
        user_id: str,
        user_name: str,
        websocket,
    ) -> GameRoom:
        """Player joins a game room."""
        room = await self.get_or_create_room(match_id, tournament_id)

        # Assign lifelines for this player
        lifelines = assign_lifelines(2)

        player = PlayerConnection(
            user_id=user_id,
            user_name=user_name,
            websocket=websocket,
            lifelines=lifelines,
        )

        if room.player1 is None or (room.player1.user_id == user_id):
            room.player1 = player
        elif room.player2 is None or (room.player2.user_id == user_id):
            room.player2 = player
        else:
            raise ValueError("Room is already full")

        # Notify all players in the room
        await self.broadcast(room, {
            "type": "player_joined",
            "userId": user_id,
            "userName": user_name,
            "roomStatus": room.status,
            "isFull": room.is_full,
        })

        # If room is full, mark as ready
        if room.is_full and room.status == "waiting":
            room.status = "ready"
            room.current_turn = room.player1.user_id

            await self.broadcast(room, {
                "type": "room_ready",
                "player1": {
                    "id": room.player1.user_id,
                    "name": room.player1.user_name,
                    "lifelines": room.player1.lifelines,
                },
                "player2": {
                    "id": room.player2.user_id,
                    "name": room.player2.user_name,
                    "lifelines": room.player2.lifelines,
                },
                "currentTurn": room.current_turn,
            })

        return room

    async def handle_message(self, room: GameRoom, user_id: str, message: dict) -> None:
        """Handle an incoming WebSocket message from a player."""
        msg_type = message.get("type", "")

        if msg_type == "start_game":
            await self._handle_start_game(room, user_id)
        elif msg_type == "shot_made":
            await self._handle_shot(room, user_id, message)
        elif msg_type == "ball_potted":
            await self._handle_ball_potted(room, user_id, message)
        elif msg_type == "turn_end":
            await self._handle_turn_end(room, user_id, message)
        elif msg_type == "use_lifeline":
            await self._handle_lifeline(room, user_id, message)
        elif msg_type == "game_over":
            await self._handle_game_over(room, user_id, message)
        elif msg_type == "chat":
            await self._handle_chat(room, user_id, message)
        else:
            logger.warning(f"Unknown message type: {msg_type}")

    async def _handle_start_game(self, room: GameRoom, user_id: str) -> None:
        if room.status == "ready":
            room.status = "playing"
            await self.broadcast(room, {
                "type": "game_started",
                "currentTurn": room.current_turn,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

    async def _handle_shot(self, room: GameRoom, user_id: str, message: dict) -> None:
        """Relay shot data to opponent for replay."""
        opponent = room.get_opponent(user_id)
        if opponent and opponent.connected:
            await self.send_to(opponent, {
                "type": "opponent_shot",
                "shotData": message.get("shotData", {}),
                "userId": user_id,
            })

    async def _handle_ball_potted(self, room: GameRoom, user_id: str, message: dict) -> None:
        """Update score when a ball is potted."""
        player = room.get_player(user_id)
        if not player:
            return

        ball_id = message.get("ballId", 0)
        # Scoring: regular ball = 10 pts, 8-ball = 25 pts
        points = 25 if ball_id == 8 else 10

        # Check for active double_or_nothing
        if "double_or_nothing" in player.lifelines_used:
            # Only double if this is within the duration
            points *= 2

        player.score += points

        await self.broadcast(room, {
            "type": "score_update",
            "userId": user_id,
            "ballId": ball_id,
            "pointsEarned": points,
            "player1Score": room.player1.score if room.player1 else 0,
            "player2Score": room.player2.score if room.player2 else 0,
        })

    async def _handle_turn_end(self, room: GameRoom, user_id: str, message: dict) -> None:
        """Switch turns."""
        if room.player1 and room.player2:
            if room.current_turn == room.player1.user_id:
                room.current_turn = room.player2.user_id
            else:
                room.current_turn = room.player1.user_id

            await self.broadcast(room, {
                "type": "turn_change",
                "currentTurn": room.current_turn,
                "player1Score": room.player1.score,
                "player2Score": room.player2.score,
            })

    async def _handle_lifeline(self, room: GameRoom, user_id: str, message: dict) -> None:
        """Player uses a lifeline. Server resolves the outcome."""
        player = room.get_player(user_id)
        if not player:
            return

        lifeline_type = message.get("lifelineType", "")

        # Validate the player has this lifeline
        if lifeline_type not in player.lifelines:
            await self.send_to(player, {
                "type": "error",
                "message": "You don't have this lifeline!",
            })
            return

        # Remove from available and add to used
        player.lifelines.remove(lifeline_type)
        player.lifelines_used.append(lifeline_type)

        # Resolve the lifeline (server-authoritative with risk)
        effect = resolve_lifeline(lifeline_type)
        effect_dict = lifeline_effect_to_dict(effect)

        # Apply score modifier
        player.score += effect.score_modifier

        # Broadcast the result to both players
        await self.broadcast(room, {
            "type": "lifeline_activated",
            "userId": user_id,
            "effect": effect_dict,
            "player1Score": room.player1.score if room.player1 else 0,
            "player2Score": room.player2.score if room.player2 else 0,
        })

        # Handle turn effects
        if effect.turn_effect == "skip_opponent":
            # Opponent loses their next turn
            pass  # Handled in turn_end logic
        elif effect.turn_effect == "lose_turn":
            # Current player loses their turn
            await self._handle_turn_end(room, user_id, {})

    async def _handle_game_over(self, room: GameRoom, user_id: str, message: dict) -> None:
        """Handle game completion."""
        room.status = "finished"

        p1_score = room.player1.score if room.player1 else 0
        p2_score = room.player2.score if room.player2 else 0

        await self.broadcast(room, {
            "type": "game_finished",
            "player1Score": p1_score,
            "player2Score": p2_score,
            "player1Lifelines": room.player1.lifelines_used if room.player1 else [],
            "player2Lifelines": room.player2.lifelines_used if room.player2 else [],
        })

    async def _handle_chat(self, room: GameRoom, user_id: str, message: dict) -> None:
        player = room.get_player(user_id)
        if player:
            await self.broadcast(room, {
                "type": "chat",
                "userId": user_id,
                "userName": player.user_name,
                "text": message.get("text", "")[:200],  # Limit message length
            })

    async def handle_disconnect(self, room: GameRoom, user_id: str) -> None:
        """Handle player disconnection."""
        player = room.get_player(user_id)
        if player:
            player.connected = False

        opponent = room.get_opponent(user_id)
        if opponent and opponent.connected:
            await self.send_to(opponent, {
                "type": "opponent_disconnected",
                "userId": user_id,
            })

    async def broadcast(self, room: GameRoom, message: dict) -> None:
        """Send a message to all connected players in a room."""
        data = json.dumps(message)
        for player in [room.player1, room.player2]:
            if player and player.connected:
                try:
                    await player.websocket.send_text(data)
                except Exception:
                    player.connected = False

    async def send_to(self, player: PlayerConnection, message: dict) -> None:
        """Send a message to a specific player."""
        if player.connected:
            try:
                await player.websocket.send_text(json.dumps(message))
            except Exception:
                player.connected = False

    def get_room_scores(self, match_id: str) -> tuple[int, int] | None:
        """Get current scores for a match room."""
        room = self.get_room(match_id)
        if not room:
            return None
        p1 = room.player1.score if room.player1 else 0
        p2 = room.player2.score if room.player2 else 0
        return p1, p2

    def get_room_lifelines_used(self, match_id: str) -> dict:
        """Get lifelines used in a match."""
        room = self.get_room(match_id)
        if not room:
            return {}
        return {
            "player1": room.player1.lifelines_used if room.player1 else [],
            "player2": room.player2.lifelines_used if room.player2 else [],
        }


# Global singleton
room_manager = GameRoomManager()
