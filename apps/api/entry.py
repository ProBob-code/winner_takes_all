from workers import WorkerEntrypoint, DurableObject
from js import Response, WebSocketPair
import asgi

from app.main import app as fastapi_app
from app.db.session import build_d1_session_factory
from app.db.repository import SQLAlchemyRepository
from app.main import service
from app.game.room_do import GameRoomDO

# Re-export GameRoomDO so Cloudflare can find it
__all__ = ["Default", "GameRoomDO"]

class Default(WorkerEntrypoint):
    async def fetch(self, request):
        path = request.url.split("?")[0]
        
        # 1. Routing for WebSockets (Match Rooms)
        # Standard: /ws/match/{match_id}
        if "/ws/match/" in path:
            upgrade_header = request.headers.get("Upgrade")
            if upgrade_header == "websocket":
                # Extract match_id from path
                # e.g. https://.../ws/match/match_123 -> match_123
                parts = path.split("/")
                match_id = parts[-1] if parts[-1] else parts[-2]
                
                # Get Durable Object stub
                do_id = self.env.ROOMS.idFromName(match_id)
                stub = self.env.ROOMS.get(do_id)
                
                # Forward to Durable Object
                return await stub.fetch(request)

        # 2. Setup D1 for standard REST requests
        binding = getattr(self.env, "db", None) or getattr(self.env, "DB", None)
        if binding:
            # Initialize D1 session factory
            session_factory = build_d1_session_factory(binding)
            repo = SQLAlchemyRepository(session_factory=session_factory)
            # Inject into service
            service.store = repo

        # 3. Handle standard REST requests via FastAPI
        return await asgi.fetch(fastapi_app, request, self.env)
