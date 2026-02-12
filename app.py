import json
import os
from datetime import datetime, date
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))
DATA_FILE = os.path.join(DATA_DIR, "workouts.json")


def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    return get_default_data()


def save_data(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


def get_default_data():
    return {
        "programs": {
            "main": {
                "name": "Full Workout",
                "exercises": [
                    "Front Squats", "Bench Press", "Deadlift",
                    "Bent Over Row", "Overhead Press",
                ],
            },
        },
        "exercises": {
            "Front Squats": {"current_weight": 120, "default_sets": 3, "default_reps": 5},
            "Bench Press": {"current_weight": 165, "default_sets": 5, "default_reps": 5},
            "Deadlift": {"current_weight": 205, "default_sets": 2, "default_reps": 5},
            "Bent Over Row": {"current_weight": 115, "default_sets": 3, "default_reps": 5},
            "Overhead Press": {"current_weight": 100, "default_sets": 3, "default_reps": 5},
        },
        "warmup": {"percentages": [50, 70], "reps": 5},
        "weight_increment": 5,
        "history": [],
    }


# ---- Routes ----

@app.route("/")
def index():
    data = load_data()
    return render_template("index.html", data=data)


@app.route("/api/data")
def api_data():
    return jsonify(load_data())


@app.route("/api/exercise/<name>/increment", methods=["POST"])
def increment_weight(name):
    data = load_data()
    if name not in data["exercises"]:
        return jsonify({"error": "Exercise not found"}), 404
    increment = data.get("weight_increment", 5)
    data["exercises"][name]["current_weight"] += increment
    save_data(data)
    return jsonify({
        "name": name,
        "new_weight": data["exercises"][name]["current_weight"],
    })


@app.route("/api/exercise/<name>/decrement", methods=["POST"])
def decrement_weight(name):
    data = load_data()
    if name not in data["exercises"]:
        return jsonify({"error": "Exercise not found"}), 404
    increment = data.get("weight_increment", 5)
    new_weight = max(0, data["exercises"][name]["current_weight"] - increment)
    data["exercises"][name]["current_weight"] = new_weight
    save_data(data)
    return jsonify({"name": name, "new_weight": new_weight})


@app.route("/api/exercise/<name>/weight", methods=["PUT"])
def set_weight(name):
    data = load_data()
    if name not in data["exercises"]:
        return jsonify({"error": "Exercise not found"}), 404
    body = request.get_json()
    weight = body.get("weight")
    if weight is None or not isinstance(weight, (int, float)) or weight < 0:
        return jsonify({"error": "Invalid weight"}), 400
    data["exercises"][name]["current_weight"] = weight
    save_data(data)
    return jsonify({"name": name, "new_weight": weight})


@app.route("/api/workout", methods=["POST"])
def log_workout():
    data = load_data()
    body = request.get_json()
    entry = {
        "date": body.get("date", date.today().isoformat()),
        "program": body.get("program", ""),
        "exercises": body.get("exercises", []),
        "notes": body.get("notes", ""),
        "duration_seconds": body.get("duration_seconds", 0),
    }
    data["history"].insert(0, entry)
    save_data(data)
    return jsonify({"status": "ok", "entry": entry})


@app.route("/api/history")
def get_history():
    data = load_data()
    return jsonify(data.get("history", []))


@app.route("/api/exercise", methods=["POST"])
def add_exercise():
    data = load_data()
    body = request.get_json()
    name = body.get("name", "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    if name in data["exercises"]:
        return jsonify({"error": "Exercise already exists"}), 409
    data["exercises"][name] = {
        "current_weight": body.get("weight", 45),
        "default_sets": body.get("sets", 3),
        "default_reps": body.get("reps", 5),
    }
    # Optionally add to a program
    program = body.get("program")
    if program and program in data["programs"]:
        data["programs"][program]["exercises"].append(name)
    save_data(data)
    return jsonify({"status": "ok", "name": name})


@app.route("/api/exercise/<name>", methods=["DELETE"])
def delete_exercise(name):
    data = load_data()
    if name not in data["exercises"]:
        return jsonify({"error": "Exercise not found"}), 404
    del data["exercises"][name]
    for prog in data["programs"].values():
        if name in prog["exercises"]:
            prog["exercises"].remove(name)
    save_data(data)
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
