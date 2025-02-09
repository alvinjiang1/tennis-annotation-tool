import json
import os

def test_save_annotation(client):
    """
    Test saving a bounding box annotation via GraphQL mutation.
    """
    mutation = {
        "query": """
            mutation {
                saveAnnotation(imageUrl: "test_image.jpg", boundingBoxes: [
                    {x: 10, y: 20, width: 100, height: 150, label: "Player"}
                ])
            }
        """
    }
    response = client.post("/api/annotation/graphql", json=mutation)
    data = response.get_json()
    assert response.status_code == 200
    assert data["data"]["saveAnnotation"] == True


def test_get_annotations(client):
    """
    Test retrieving all saved annotations via GraphQL.
    """
    query = {"query": "{ getAnnotations { id imageUrl boundingBoxes { x y width height label } } }"}
    response = client.post("/api/annotation/graphql", json=query)
    data = response.get_json()
    assert response.status_code == 200
    print(data["data"])
    assert isinstance(data["data"]["getAnnotations"], list)


def test_video_upload(client):
    """
    Test video upload API with a real video file.
    """
    test_video_path = "tests/media/tennis-tiny-tiny.mp4"
    assert os.path.exists(test_video_path), f"Test video file not found: {test_video_path}"

    with open(test_video_path, "rb") as video_file:
        video_data = {
            "video": (video_file, "test_video.mp4")  # Read real video file
        }
        response = client.post("/api/video/upload", content_type="multipart/form-data", data=video_data)
        data = response.get_json()

    assert response.status_code == 200, f"Upload failed: {data}"  # Print error if test fails


def test_inference(client):
    """
    Test GroundingDINO inference on a video frame.
    """
    # Train model via GraphQL
    train_response = client.post("/graphql", json={"query": "mutation { trainModel }"})
    assert train_response.status_code == 200, f"Training failed: {train_response.get_json()}"

    payload = {"video_path": "backend/uploads/test_video.mp4", "frame_number": 10}
    response = client.post("/api/inference/run", json=payload)
    data = response.get_json()

    assert response.status_code == 200, f"Inference failed: {data}"


def test_train_model(client):
    """
    Test triggering the few-shot training of GroundingDINO.
    """
    response = client.post("/api/inference/train")
    data = response.get_json()

    assert response.status_code in [200, 400]  # Can return an error if no annotations exist
    if response.status_code == 200:
        assert "model_path" in data
