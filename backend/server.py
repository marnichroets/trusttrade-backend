"""
TrustTrade Server - FastAPI Application Entry Point
This file is a compatibility layer that imports the refactored application from main.py

The actual implementation has been refactored into:
- /app/backend/core/ - Configuration, database, security
- /app/backend/models/ - Pydantic models
- /app/backend/routes/ - API route handlers
- /app/backend/services/ - Business logic (existing files)

Original monolithic server.py is backed up at server.py.backup
"""

# Import the app from the new main module
from main import app

# Re-export for uvicorn compatibility (uvicorn server:app)
__all__ = ['app']
