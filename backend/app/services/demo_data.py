"""Curated demo dataset for Parrot's demo mode.

This data is clearly labelled demo/sample content. It exists so the study
loop (retrieve -> explain -> quiz -> evaluate -> progress) can be exercised
end to end without Supabase credentials or an LLM key. When Supabase/LLM
credentials are configured, the real integrations take precedence.
"""

from __future__ import annotations

COLLEGE = "Demo University"
COURSE = "B.Tech Semester 3"
BRANCH = "Electronics and Communication"

FARADAY_ID = "demo-faraday-notes"
PYTHON_ID = "demo-python-notes"

TEACHBACK_RUBRICS: dict[str, dict] = {
    "Faraday's law": {
        "resource_id": FARADAY_ID,
        "expected_points": [
            {
                "point": "Induced emf is proportional to the rate of change of magnetic flux",
                "keywords": ["rate of change", "dΦ/dt", "dphi/dt", "changing flux", "change of flux"],
            },
            {
                "point": "Magnetic flux is Φ = B · A cosθ",
                "keywords": ["flux", "b", "area", "cos", "weber"],
            },
            {
                "point": "Lenz's law explains the negative sign: induced current opposes the change in flux",
                "keywords": ["lenz", "opposes", "opposite", "negative sign", "dire"],
            },
            {
                "point": "N turns of a coil multiply the induced emf",
                "keywords": ["turns", "n", "coil", "loops", "winding"],
            },
            {
                "point": "Applications include generators and transformers",
                "keywords": ["generator", "transformer", "inductor", "application"],
            },
        ],
        "misconceptions": [
            {
                "misconception": "Says an emf is induced when flux is constant (it is not; the flux must change)",
                "triggers": ["constant flux", "steady flux", "unchanged flux"],
            },
            {
                "misconception": "Says emf is proportional to the flux itself rather than its rate of change",
                "triggers": ["emf is proportional to flux", "emf proportional to flux", "depends on flux not the change"],
            },
            {
                "misconception": "Confuses magnetic flux with electric field or current induced directly",
                "triggers": ["electric flux", "electric field induces"],
            },
        ],
        "prompts": [
            "Explain Faraday's law in your own words, including what the negative sign means.",
            "A magnet is moved into a coil, held still, then removed. What happens in each phase, and why?",
        ],
        "examples": [
            "A coil of 50 turns with area 0.02 m² sits in a field that drops from 0.4 T to 0 in 0.1 s.",
            "Flux change ΔΦ = B·A = 0.4 × 0.02 = 0.008 Wb, so |emf| = N·ΔΦ/Δt = 50 × 0.008 / 0.1 = 4 V.",
        ],
        "keywords": ["faraday", "induction", "emf", "flux", "lenz", "weber", "tesla", "coil", "transformer", "generator"],
    },
    "Python lists and loops": {
        "resource_id": PYTHON_ID,
        "expected_points": [
            {
                "point": "Lists are ordered, mutable collections; indexing starts at 0",
                "keywords": ["zero", "0", "index", "ordered", "mutable"],
            },
            {
                "point": "Slicing uses [start:stop:step] and the stop index is excluded",
                "keywords": ["slice", "stop", "end is exclusive", "excluded", "does not include"],
            },
            {
                "point": "for loops iterate directly over sequences (lists, strings, ranges)",
                "keywords": ["for", "iterate", "range", "sequence"],
            },
            {
                "point": "while loops repeat on a condition and need explicit updates to avoid infinite loops",
                "keywords": ["while", "condition", "infinite"],
            },
            {
                "point": "append/pop and list comprehensions build and transform lists",
                "keywords": ["append", "pop", "comprehension", "method"],
            },
        ],
        "misconceptions": [
            {
                "misconception": "Says Python list indexing starts at 1 (it starts at 0)",
                "triggers": ["starts at 1", "indexing begins at 1"],
            },
            {
                "misconception": "Says the slice end index is included (it is excluded)",
                "triggers": ["end index is included", "stop is included", "both ends included"],
            },
            {
                "misconception": "Says a while loop always runs a fixed number of times (it runs until the condition fails)",
                "triggers": ["while loop always runs", "while loop runs fixed"],
            },
        ],
        "prompts": [
            "Explain how Python lists and loops work in your own words, including slicing.",
            "Why does `for ch in \"abc\":` work without an index variable?",
        ],
        "examples": [
            "nums = [1, 2, 3, 4]; nums[1:3] gives [2, 3] — the stop index is not included.",
            "squares = [n * n for n in range(5)] produces [0, 1, 4, 9, 16].",
        ],
        "keywords": ["python", "list", "loop", "slice", "index", "iterate", "range", "comprehension", "while", "for"],
    },
}

QUIZ_BANKS: dict[str, list[dict]] = {
    FARADAY_ID: [
        {
            "id": "faraday-q1",
            "type": "multiple_choice",
            "difficulty": 1,
            "stem": "According to Faraday's law, an emf is induced in a coil when…",
            "options": [
                "A constant magnetic flux passes through it",
                "The magnetic flux through it changes with time",
                "A large current flows in the coil",
                "The coil's resistance changes",
            ],
            "answer_index": 1,
            "accepted_keywords": [],
            "explanation": "emf = −N · dΦ/dt. A constant flux induces no emf; only a change in flux does.",
        },
        {
            "id": "faraday-q2",
            "type": "multiple_choice",
            "difficulty": 2,
            "stem": "The negative sign in emf = −N·dΦ/dt encodes which physical principle?",
            "options": [
                "Conservation of charge",
                "Ohm's law",
                "Lenz's law — the induced current opposes the change in flux",
                "Conservation of momentum",
            ],
            "answer_index": 2,
            "accepted_keywords": [],
            "explanation": "The minus sign is Lenz's law: the induced current's own field opposes the change that produced it.",
        },
        {
            "id": "faraday-q3",
            "type": "short_answer",
            "difficulty": 2,
            "stem": "State Faraday's law of electromagnetic induction in words (mention flux).",
            "options": [],
            "answer_index": None,
            "accepted_keywords": [["flux"], ["emf", "voltage", "electromotive"]],
            "explanation": "The induced emf in a circuit is proportional to the rate of change of magnetic flux through it; with N turns, emf = −N·dΦ/dt.",
        },
        {
            "id": "faraday-q4",
            "type": "short_answer",
            "difficulty": 3,
            "stem": "A 50-turn coil of area 0.02 m² sits in a field that falls from 0.4 T to 0 in 0.1 s. What is the magnitude of the induced emf?",
            "options": [],
            "answer_index": None,
            "accepted_keywords": [["4v", "4 v", "4 volt", "four volt"]],
            "explanation": "ΔΦ = 0.4 × 0.02 = 0.008 Wb; |emf| = N·ΔΦ/Δt = 50 × 0.008 / 0.1 = 4 V.",
        },
    ],
    PYTHON_ID: [
        {
            "id": "python-q1",
            "type": "multiple_choice",
            "difficulty": 1,
            "stem": "What does `nums = [10, 20, 30]; nums[1]` evaluate to?",
            "options": ["10", "20", "30", "IndexError"],
            "answer_index": 1,
            "accepted_keywords": [],
            "explanation": "Indexing starts at 0, so index 1 is the second element, 20.",
        },
        {
            "id": "python-q2",
            "type": "multiple_choice",
            "difficulty": 2,
            "stem": "What does `nums = [1, 2, 3, 4]; nums[1:3]` evaluate to?",
            "options": ["[1, 2]", "[2, 3]", "[2, 3, 4]", "[1, 2, 3]"],
            "answer_index": 1,
            "accepted_keywords": [],
            "explanation": "Slices include the start index and exclude the stop index: [2, 3].",
        },
        {
            "id": "python-q3",
            "type": "short_answer",
            "difficulty": 2,
            "stem": "In one sentence: what is the difference between a for loop and a while loop in Python?",
            "options": [],
            "answer_index": None,
            "accepted_keywords": [["for"], ["while"]],
            "explanation": "A for loop iterates over a sequence (or range) a known collection of items at a time, while a while loop repeats as long as its condition stays true.",
        },
        {
            "id": "python-q4",
            "type": "short_answer",
            "difficulty": 3,
            "stem": "Write your own words: what does `[n * n for n in range(5)]` produce and what is this construct called?",
            "options": [],
            "answer_index": None,
            "accepted_keywords": [["0"], ["comprehension", "list comprehension"]],
            "explanation": "It is a list comprehension and produces [0, 1, 4, 9, 16].",
        },
    ],
}


def demo_resources() -> list[dict]:
    """Return the full demo catalog: resources with passages and metadata."""

    faraday_passages = [
        {
            "id": "faraday-p1",
            "page": 1,
            "content": "Faraday's law of electromagnetic induction states that the induced electromotive force (emf) in a closed circuit equals the negative of the time rate of change of the magnetic flux through the circuit: emf = -N · dΦ/dt, where N is the number of turns of the coil. Magnetic flux itself is Φ = B · A · cosθ, measured in webers (Wb), where B is the magnetic flux density in tesla, A the loop area, and θ the angle between the field and the area's normal.",
        },
        {
            "id": "faraday-p2",
            "page": 2,
            "content": "The minus sign in Faraday's law is Lenz's law: the induced current flows in the direction whose own magnetic field opposes the change in flux that produced it. This is required by conservation of energy — a constant flux induces no emf, and it is the change of flux, not the flux value itself, that matters.",
        },
        {
            "id": "faraday-p3",
            "page": 3,
            "content": "Worked example: a coil of N = 50 turns and area A = 0.02 m² sits in a uniform field that drops from B = 0.4 T to zero in Δt = 0.1 s. The flux change is ΔΦ = B·A = 0.4 × 0.02 = 0.008 Wb, so the magnitude of the induced emf is |emf| = N·ΔΦ/Δt = 50 × 0.008 / 0.1 = 4 V.",
        },
        {
            "id": "faraday-p4",
            "page": 4,
            "content": "Applications: electric generators convert mechanical rotation into emf by continuously changing the flux through coil windings; transformers transfer energy between circuits through a shared, changing flux in an iron core; induction cooktops and wireless charging pads induce currents in the target without any wire connection.",
        },
    ]

    python_passages = [
        {
            "id": "python-p1",
            "page": 1,
            "content": "Python lists are ordered, mutable collections: nums = [10, 20, 30]. Indexing starts at 0, so nums[1] is 20 and the last element is nums[-1] = 30. Negative indices count from the end.",
        },
        {
            "id": "python-p2",
            "page": 2,
            "content": "Slicing takes [start:stop:step] and always excludes the stop index: nums[1:3] on [1, 2, 3, 4] yields [2, 3]. A step of -1 reverses a list. Slices return new lists, so they never modify the original.",
        },
        {
            "id": "python-p3",
            "page": 3,
            "content": "for loops iterate directly over any sequence — lists, strings, tuples or range objects — with no index variable needed. while loops repeat as long as their condition is truthy, and the loop variable must be updated inside the body or the loop runs forever.",
        },
        {
            "id": "python-p4",
            "page": 4,
            "content": "Useful list operations: nums.append(x) adds to the end, nums.pop() removes and returns the last item, len(nums) gives the length. A list comprehension builds a new list from an expression: squares = [n * n for n in range(5)] produces [0, 1, 4, 9, 16].",
        },
    ]

    return [
        {
            "id": FARADAY_ID,
            "course_id": "demo-physics-ii",
            "title": "Faraday's Law of Induction — Lecture Notes",
            "category": "notes",
            "subject": "Electromagnetic Induction",
            "topics": list(TEACHBACK_RUBRICS.keys()),
            "branch": BRANCH,
            "semester": "Semester 3",
            "college": COLLEGE,
            "course": f"{COURSE} — Physics II",
            "description": "Worked demo lecture notes covering Faraday's law, Lenz's law and applications (DEMO content).",
            "storage_path": None,
            "is_published": True,
            "passages": faraday_passages,
            "quiz": QUIZ_BANKS[FARADAY_ID],
        },
        {
            "id": PYTHON_ID,
            "course_id": "demo-programming-fundamentals",
            "title": "Python Lists and Loops — Practical Notes",
            "category": "notes",
            "subject": "Programming Fundamentals",
            "topics": list(TEACHBACK_RUBRICS.keys()),
            "branch": "Computer Science",
            "semester": "Semester 2",
            "college": COLLEGE,
            "course": f"{COURSE} — Programming Fundamentals",
            "description": "Worked demo practical notes covering Python lists, slicing, for/while loops and comprehensions (DEMO content).",
            "storage_path": None,
            "is_published": True,
            "passages": python_passages,
            "quiz": QUIZ_BANKS[PYTHON_ID],
        },
    ]


def find_demo_resource(resource_id: str) -> dict | None:
    for resource in demo_resources():
        if resource["id"] == resource_id:
            return resource
    return None


def is_demo_id(resource_id: str) -> bool:
    return resource_id.startswith("demo-")
