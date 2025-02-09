from flask import Flask
from flask_cors import CORS
from strawberry.flask.views import GraphQLView
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from routes.annotation import annotation_router
from routes.video import video_router
from routes.inference import inference_router

# Initialize Flask App
app = Flask(__name__)
CORS(app, resource={r"/api/*": {"origins": "*"}})

# Add GraphQL Route
# No DB Linked for now
# app.add_url_rule("/graphql", view_func=GraphQLView.as_view("graphql", schema=schema, graphiql=True))

# Register API Routes
app.register_blueprint(annotation_router, url_prefix='/api/annotation')
app.register_blueprint(video_router, url_prefix='/api/video')
app.register_blueprint(inference_router, url_prefix='/api/inference')

if __name__ == "__main__":
    app.run(debug=True)