---
name: flask
description: |
  Flask is a lightweight Python micro web framework that provides the essentials
  for web development without imposing structure. It uses Jinja2 templates and
  Werkzeug WSGI toolkit, with a rich ecosystem of extensions for databases, auth, and more.
license: Apache-2.0
compatibility:
  - python >= 3.8
  - pip
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - python
    - web
    - micro
    - api
    - jinja2
---

# Flask

Flask is a micro web framework for Python. It's minimal by design — you choose your ORM, auth system, and structure. Extensions fill in the gaps.

## Installation

```bash
# Install Flask
pip install flask
```

## Application Factory

```python
# app/__init__.py — application factory pattern
from flask import Flask
from .extensions import db, migrate, login_manager
from .config import Config

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    from .auth import bp as auth_bp
    from .main import bp as main_bp
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(main_bp)

    return app
```

```python
# app/extensions.py — extension instances
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
login_manager.login_view = "auth.login"
```

## Configuration

```python
# app/config.py — configuration classes
import os

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-key")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///app.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
```

## Routes and Blueprints

```python
# app/main/routes.py — main blueprint routes
from flask import render_template, request, redirect, url_for, flash, jsonify
from flask_login import login_required, current_user
from . import bp
from ..models import Post
from ..extensions import db

@bp.route("/")
def index():
    page = request.args.get("page", 1, type=int)
    posts = Post.query.order_by(Post.created_at.desc()).paginate(page=page, per_page=20)
    return render_template("main/index.html", posts=posts)

@bp.route("/post", methods=["POST"])
@login_required
def create_post():
    post = Post(body=request.form["body"], author=current_user)
    db.session.add(post)
    db.session.commit()
    flash("Post created!")
    return redirect(url_for("main.index"))
```

```python
# app/main/__init__.py — blueprint definition
from flask import Blueprint
bp = Blueprint("main", __name__)
from . import routes
```

## Models

```python
# app/models.py — SQLAlchemy models
from datetime import datetime, UTC
from flask_login import UserMixin
from .extensions import db, login_manager

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256))
    posts = db.relationship("Post", backref="author", lazy="dynamic")

@login_manager.user_loader
def load_user(id):
    return db.session.get(User, int(id))

class Post(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(UTC))
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
```

## API Routes

```python
# app/api/routes.py — JSON API endpoints
from flask import jsonify, request, abort
from . import bp
from ..models import Post
from ..extensions import db

@bp.route("/posts")
def get_posts():
    posts = Post.query.order_by(Post.created_at.desc()).limit(50).all()
    return jsonify([{"id": p.id, "body": p.body, "author": p.author.username} for p in posts])

@bp.route("/posts", methods=["POST"])
def create_post():
    data = request.get_json()
    if not data or "body" not in data:
        abort(400)
    post = Post(body=data["body"], user_id=data["user_id"])
    db.session.add(post)
    db.session.commit()
    return jsonify({"id": post.id}), 201
```

## Testing

```python
# tests/test_main.py — testing Flask app
import pytest
from app import create_app
from app.config import TestConfig
from app.extensions import db

@pytest.fixture
def client():
    app = create_app(TestConfig)
    with app.test_client() as client:
        with app.app_context():
            db.create_all()
        yield client

def test_index(client):
    resp = client.get("/")
    assert resp.status_code == 200
```

## Running

```bash
# Run development server
flask --app app run --debug --port 5000

# Database migrations
flask --app app db init
flask --app app db migrate -m "Initial"
flask --app app db upgrade
```

## Key Patterns

- Always use the application factory pattern for testability
- Use blueprints to organize code by feature
- Initialize extensions separately from `create_app` to avoid circular imports
- Use `flask db` (Flask-Migrate) for schema changes — never `db.create_all()` in production
- Use `@login_required` from Flask-Login for protected routes
