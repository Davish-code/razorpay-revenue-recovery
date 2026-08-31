# AI Revenue Recovery Agent - Razorpay AI Buildathon 2026 (Track 03)

## The Problem
Revenue loss rarely happens in one clean step. A payment degrades or a checkout gets abandoned. This project closes the loop from detecting the problem to diagnosing it, choosing the right intervention, and recovering the money.

## The Solution (Execution Bar Met)
* **Measured Recovery:** Actively tracks total money at risk vs. money recovered.
* **Audit Trail:** Every AI action (e.g., sending an alternative payment link, auto-retrying) is logged with the reasoning.
* **Stopping Rules:** Hard limits on how many times a user is contacted to prevent spam.

## Tech Stack
* **Frontend:** HTML, CSS, JavaScript (Merchant Dashboard)
* **Backend:** Python
* **Database:** MySQL
* **AI:** (LLM API for classification and decision making)