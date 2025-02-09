import sys
import os
import pytest

# Add the backend directory to sys.path so imports work correctly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app import app  # Now it should correctly import `backend/app.py`

from backend.app import app  # Import the Flask app from backend/app.py

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client
