import os
import psycopg2
import json
import strawberry
from typing import List

# Load environment variables
DB_NAME = os.getenv("POSTGRES_DB", "tennis_annotations")
DB_USER = os.getenv("POSTGRES_USER", "admin")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "admin")
DB_HOST = os.getenv("POSTGRES_HOST", "database")  # 'database' is the Docker service name

# Connect to PostgreSQL
def get_db_connection():
    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST
    )

@strawberry.input
class BoundingBoxInput:
    x: float
    y: float
    width: float
    height: float
    label: str

@strawberry.type
class BoundingBox:
    x: float
    y: float
    width: float
    height: float
    label: str

@strawberry.type
class Annotation:
    id: int
    image_url: str
    bounding_boxes: List[BoundingBox]

# Initialize PostgreSQL database
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS annotations (
            id SERIAL PRIMARY KEY,
            image_url TEXT NOT NULL,
            bounding_boxes JSONB NOT NULL
        )
    """)
    conn.commit()
    conn.close()

init_db()  # Run database initialization at startup

@strawberry.mutation
def save_annotation(image_url: str, bounding_boxes: List[BoundingBoxInput]) -> bool:
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO annotations (image_url, bounding_boxes) VALUES (%s, %s)",
            (image_url, json.dumps([box.__dict__ for box in bounding_boxes]))
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error saving annotation: {e}")
        return False

@strawberry.field
def get_annotations() -> List[Annotation]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, image_url, bounding_boxes FROM annotations")
    rows = cursor.fetchall()
    conn.close()

    annotations = []
    for row in rows:
        bounding_boxes_data = json.loads(row[2]) if row[2] else []
        bounding_boxes = [BoundingBox(**box) for box in bounding_boxes_data]
        annotations.append(Annotation(id=row[0], image_url=row[1], bounding_boxes=bounding_boxes))

    return annotations

# Define GraphQL schema
@strawberry.type
class Query:
    get_annotations = get_annotations

@strawberry.type
class Mutation:
    save_annotation = save_annotation

schema = strawberry.Schema(query=Query, mutation=Mutation)
