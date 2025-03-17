from dotenv import load_dotenv
load_dotenv()
from flask import Flask
from flask_cors import CORS
from strawberry.flask.views import GraphQLView
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from routes.annotation import annotation_router
from routes.video import video_router
from routes.inference import inference_router
from routes.training import training_router
from routes.util import init_models
from routes.generate_label import generate_label_router
from routes.label import label_router

# Initialize Flask App
app = Flask(__name__)
CORS(app, resource={r"/api/*": {"origins": "*"}})

init_models()

# Add GraphQL Route
# No DB Linked for now
# app.add_url_rule("/graphql", view_func=GraphQLView.as_view("graphql", schema=schema, graphiql=True))

# Register API Routes
app.register_blueprint(training_router, url_prefix="/api/training")
app.register_blueprint(annotation_router, url_prefix='/api/annotation')
app.register_blueprint(video_router, url_prefix='/api/video')
app.register_blueprint(inference_router, url_prefix='/api/inference')
app.register_blueprint(generate_label_router, url_prefix="/api/generate_label")
app.register_blueprint(label_router, url_prefix='/api/label')


if __name__ == "__main__":
    app.run(debug=True)