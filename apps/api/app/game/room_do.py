from js import WebSocketPair, Response
from workers import DurableObject
import json
import logging

logger = logging.getLogger(__name__)

class GameRoomDO(DurableObject):
    def __init__(self, ctx, env):
        self.ctx = ctx
        self.env = env
        # State can be stored in self.ctx.storage if persistent across restarts is needed

    async def fetch(self, request):
        # 1. Handle WebSocket Upgrade
        upgrade_header = request.headers.get("Upgrade")
        if upgrade_header != "websocket":
            return Response.new("Expected websocket", status=426)

        # 2. Create WebSocket Pair
        pair = WebSocketPair.new()
        client, server = pair.values()

        # 3. Accept the server end
        self.ctx.acceptWebSocket(server)
        
        # TODO: Move room_manager logic here for authorative game state
        
        return Response.new(None, status=101, webSocket=client)

    async def webSocketMessage(self, ws, message):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            
            # Basic broadcasting logic for testing
            # In a real DO, we would track all connected 'ws' objects
            for connection in self.ctx.getWebSockets():
                connection.send(message)
                
        except Exception as e:
            logger.error(f"Error in webSocketMessage: {e}")

    async def webSocketClose(self, ws, code, reason, wasClean):
        """Handle WebSocket closure."""
        logger.info(f"WebSocket closed: {code}")

    async def webSocketError(self, ws, error):
        """Handle WebSocket errors."""
        logger.error(f"WebSocket error: {error}")
