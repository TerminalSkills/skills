---
name: flask
description: |
  Flask is a lightweight Python web framework built on Werkzeug and Jinja2; it gives you routing, requests, templates and a test client and leaves the rest to extensions. Use this skill when the user wants to build a Flask app or JSON API, set up an application factory with blueprints, add Flask-SQLAlchemy, Flask-Migrate or Flask-Login, write pytest tests for a Flask app, or run it with the flask CLI and gunicorn.
license: Apache-2.0
compatibility: 'Python >= 3.9, pip; Flask 3.1'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/pallets/flask
  tags:
    - python
    - web
    - micro
    - api
    - jinja2
---

# Flask

## Overview

Flask is a micro web framework for Python. It is minimal by design: you pick the ORM, auth and layout, and extensions fill the gaps. This skill covers Flask 3.1 (3.1.3, February 2026; it needs Python 3.9 or newer) with Flask-SQLAlchemy 3.1, Flask-Migrate 4.1 and Flask-Login 0.6, using the application-factory plus blueprints layout. The code below was run with those versions: tests pass and the migrations apply.

## Instructions

### Install

```bash
python3 -m venv .venv
.venv/bin/pip install flask flask-sqlalchemy flask-migrate flask-login pytest gunicorn
```

### Extensions and configuration

The project is a package `app/` with `config.py`, `extensions.py`, `models.py`, blueprint packages `main/` and `api/`, `templates/`, and `tests/` beside it.

Create extensions in their own module, without an app, so blueprints import them without circular imports. Pass a `DeclarativeBase` subclass as `model_class` for SQLAlchemy 2.0 style models.

```python
# app/extensions.py
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)
migrate = Migrate()
login_manager = LoginManager()
login_manager.login_view = "main.login"
```

```python
# app/config.py
import os

class Config:
    SECRET_KEY = os.environ["SECRET_KEY"]  # fail at startup if it is missing
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///app.db")

class TestConfig(Config):
    TESTING = True
    SECRET_KEY = "test-only-secret"
    SQLALCHEMY_DATABASE_URI = "sqlite://"
```

`SECRET_KEY` signs the session cookie. Read it from the environment without a default, so a forgotten variable stops the app at startup instead of shipping a guessable key.

### Application factory

```python
# app/__init__.py
from flask import Flask

from .config import Config
from .extensions import db, login_manager, migrate

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    from .api import bp as api_bp
    from .main import bp as main_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix="/api")

    return app
```

### Models

```python
# app/models.py
from datetime import datetime, timezone

from flask_login import UserMixin
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db, login_manager

class User(UserMixin, db.Model):
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    posts: Mapped[list["Post"]] = relationship(back_populates="author")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Post(db.Model):
    id: Mapped[int] = mapped_column(primary_key=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    author: Mapped[User] = relationship(back_populates="posts")

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))
```

### HTML blueprint

Each blueprint package's `__init__.py` creates `bp = Blueprint("main", __name__)` and then imports its `routes` module at the bottom (`from . import routes`); the `api` package does the same with `Blueprint("api", __name__)`.

```python
# app/main/routes.py
from flask import flash, redirect, render_template, request, url_for
from flask_login import login_user

from ..extensions import db
from ..models import Post, User
from . import bp

@bp.route("/")
def index():
    page = request.args.get("page", 1, type=int)
    query = db.select(Post).order_by(Post.created_at.desc())
    posts = db.paginate(query, page=page, per_page=20, error_out=False)
    return render_template("main/index.html", posts=posts)

@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user = db.session.scalar(
            db.select(User).where(User.username == request.form["username"])
        )
        if user and user.check_password(request.form["password"]):
            login_user(user)
            return redirect(url_for("main.index"))
        flash("Wrong username or password")
    return render_template("main/login.html")

```

`db.paginate()` takes a `select()` and returns a pagination object that you can loop over in the template (`posts.items`, `posts.has_next`, `posts.next_num`). The old `Model.query.paginate()` still works in Flask-SQLAlchemy 3.1 but is marked legacy.

### JSON API blueprint

```python
# app/api/routes.py
from flask import abort, jsonify, request
from flask_login import current_user

from ..extensions import db
from ..models import Post
from . import bp

@bp.get("/posts")
def list_posts():
    posts = db.session.scalars(
        db.select(Post).order_by(Post.created_at.desc()).limit(50)
    )
    return jsonify([{"id": p.id, "body": p.body, "author": p.author.username} for p in posts])

@bp.post("/posts")
def create_post():
    if not current_user.is_authenticated:
        abort(401)
    data = request.get_json(silent=True)
    if not data or not data.get("body"):
        abort(400, description="body is required")
    post = Post(body=data["body"], author=current_user)
    db.session.add(post)
    db.session.commit()
    return jsonify(id=post.id), 201

@bp.errorhandler(404)
def not_found(e):
    return jsonify(error="Not found"), 404
```

Take the author from `current_user`, never from a `user_id` in the request body. `@bp.get` and `@bp.post` are shortcuts for `route(..., methods=[...])`.

### Templates

`templates/base.html` holds the page shell with `{% block content %}{% endblock %}` and `get_flashed_messages()`; pages extend it. Jinja2 autoescapes `{{ }}` in `.html` templates, so never mark user input `|safe`.

### Testing

```python
# tests/test_posts.py
import pytest

from app import create_app
from app.config import TestConfig
from app.extensions import db
from app.models import User

@pytest.fixture
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
        user = User(username="maria")
        user.set_password("correct-horse")
        db.session.add(user)
        db.session.commit()
        yield app
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

def test_index_is_empty(client):
    assert client.get("/").status_code == 200

def test_api_requires_login(client):
    assert client.post("/api/posts", json={"body": "hi"}).status_code == 401

def test_login_and_post(client):
    client.post("/login", data={"username": "maria", "password": "correct-horse"})
    resp = client.post("/api/posts", json={"body": "First note"})
    assert resp.status_code == 201
    assert client.get("/api/posts").json[0]["author"] == "maria"
```

`TestConfig` uses an in-memory database; keep the app context open for the whole test so it survives between requests.

### Running and migrations

```bash
export SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
flask --app app run --debug --port 5000     # development server with reloader

flask --app app db init                     # once, creates migrations/
flask --app app db migrate -m "Initial"     # generate a revision from the models
flask --app app db upgrade                  # apply it

gunicorn --workers 4 --bind 127.0.0.1:8000 "app:create_app()"   # production
```

## Examples

### Example 1: "Add a health check to my Flask API"

Add to `app/api/routes.py`:

```python
@bp.get("/health")
def health():
    db.session.execute(db.select(1))
    return jsonify(status="ok")
```

`curl -s localhost:5000/api/health` returns JSON with `"status": "ok"` (the debug server pretty-prints it).

### Example 2: "Write a test that logs in and creates a post"

The `test_login_and_post` test above does this; the test client keeps cookies, so the API call after the `/login` POST is authenticated.

Run it with `SECRET_KEY=ci-secret python -m pytest -q` from the project root (plain `pytest` cannot import `app`); the output ends in `3 passed`.

## Guidelines

- Use the application factory and blueprints; initialise extensions with `init_app` inside `create_app`.
- Debug mode exposes the interactive debugger, which allows code execution. Use it on localhost only.
- Use `flask db migrate` and `upgrade` for schema changes in production, not `db.create_all()`.
- Hash passwords with `generate_password_hash`; never store them in plain text.
- Cookie sessions are signed, not encrypted: do not put secrets in `session`. To rotate the key, put the old ones in `SECRET_KEY_FALLBACKS` (Flask 3.1).
- Protect form POSTs against CSRF (Flask-WTF `CSRFProtect`); JSON APIs that use cookie login need the same care.
- Set `MAX_CONTENT_LENGTH` to bound request sizes.
