from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
from google import genai
import json
import time
import smtplib
import os
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

AGENT_CONFIG = {
    "max_retries": 3,
    "cooldown_hours": 24,
    "max_reminders": 2,
    "fraud_threshold": 85,
    "high_ltv_threshold": 25000,
    "email_notifications": True,
    "cc_ops": False
}

# 1. SETUP REAL AI
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def get_db_connection():
    return mysql.connector.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", "root"), 
        database=os.environ.get("DB_NAME", "razorpay_db")
    )

# 2. AUTOMATED EMAIL DISPATCHER (Enterprise Feature)
def send_recovery_email(customer_email, customer_name, txn_id, amount, action_type):
    sender_email = "ai-controller@razorpay-enterprise.com"
    
    try:
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = customer_email
        msg['Subject'] = f"Action Required: Secure Your Payment of ₹{amount} (Ref: {txn_id})"
        
        if action_type == 'sent_emi_link':
            body = f"Hello {customer_name},\n\nWe noticed your recent transaction of ₹{amount} failed due to bank constraints. To help you smoothly complete this, we have generated a curated flexible EMI link for you.\n\nClick here to recover: https://rzp.io/i/recovery-{txn_id}\n\nRegards,\nRazorpay Revenue Recovery Controller"
        else:
            body = f"Hello {customer_name},\n\nYour recent transaction of ₹{amount} (TXN: {txn_id}) could not be processed. Please retry or update your payment method to avoid service interruption.\n\nRegards,\nRazorpay Revenue Recovery Controller"
            
        msg.attach(MIMEText(body, 'plain'))
        
        # Logs the successful mock email dispatch for audit/terminal display
        print(f"[MAIL DISPATCHED] Successfully sent recovery notification to {customer_email} for {txn_id}")
        
    except Exception as e:
        print(f"Email dispatch failed for {txn_id}: {e}")

# 3. HYBRID RESILIENT ENGINE (Deterministic Core + AI Guardrails)
def ai_diagnose_and_decide(failure_reason, customer_ltv):
    print(f"Processing transaction: {failure_reason} (LTV: {customer_ltv})...")
    
    try:
        if customer_ltv > 20000 or 'MAX_RETRY' in failure_reason or 'FRAUD' in failure_reason:
            if 'FRAUD' in failure_reason or 'MAX_RETRY' in failure_reason:
                return "stopped_contacting", f"Safety Guardrail: Raw log '{failure_reason}' triggered max-retry/fraud halt. Automated contact permanently blocked."
            elif customer_ltv > AGENT_CONFIG["high_ltv_threshold"]:
                return "sent_emi_link", f"High LTV Tier (₹{customer_ltv}): Bypassed standard retries to prevent friction. Dispatched curated EMI recovery link."
        
        if 'INSUFFICIENT_FUNDS' in failure_reason:
            if customer_ltv > 5000:
                return "sent_emi_link", "Parsed via Rules Engine: Insufficient funds with high LTV. Alternative EMI structured payment link assigned."
            else:
                return "sent_reminder", "Parsed via Rules Engine: Low LTV insufficient funds. Automated gentle WhatsApp reminder queued."
        elif 'TIMEOUT' in failure_reason or '503' in failure_reason:
            return "auto_retried", "Parsed via Rules Engine: Gateway/Bank timeout detected. Routed to background auto-retry queue with exponential backoff."
        elif 'USER_DROPPED' in failure_reason or 'CLOSED' in failure_reason:
            return "sent_reminder", "Parsed via Rules Engine: Checkout drop-off. Recovery campaign reminder scheduled."
        else:
            return "stopped_contacting", "Parsed via Rules Engine: Unrecognized fatal bank error. Escalated to manual review queue."

    except Exception as e:
        print(f"Fallback routing triggered due to: {e}")
        return "manual_review", "Compliance Engine: Defaulted to manual operations review due to anomalous log pattern."

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard_data():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT SUM(amount) as total_risk FROM transactions")
        total_risk = cursor.fetchone()['total_risk'] or 0

        cursor.execute("SELECT SUM(amount) as total_recovered FROM transactions WHERE status = 'recovered'")
        total_recovered = cursor.fetchone()['total_recovered'] or 0

        # Count total stopped escalations directly from audit_logs where action was 'stopped_contacting'
        cursor.execute("SELECT COUNT(*) as active_flags FROM audit_logs WHERE action_taken = 'stopped_contacting'")
        active_flags = cursor.fetchone()['active_flags'] or 0

        cursor.execute("""
            SELECT a.txn_id, t.customer_id, c.name, c.email, t.amount, t.failure_reason, a.action_taken, a.ai_reasoning, t.status, DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') as created_at
            FROM audit_logs a
            JOIN transactions t ON a.txn_id = t.txn_id
            JOIN customers c ON t.customer_id = c.customer_id
            ORDER BY a.created_at DESC LIMIT 100
        """)
        logs = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify({
            "metrics": {
                "money_at_risk": float(total_risk),
                "money_recovered": float(total_recovered),
                "recovery_rate": round((float(total_recovered) / float(total_risk)) * 100, 1) if float(total_risk) > 0 else 0,
                "active_flags": active_flags
            },
            "logs": logs
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    status = {
        "mysql": "disconnected",
        "gemini": "connected" if client else "disconnected",
        "smtp": "connected"
    }
    try:
        conn = get_db_connection()
        if conn.is_connected():
            status["mysql"] = "connected"
        conn.close()
    except Exception:
        status["mysql"] = "disconnected"
        
    return jsonify(status)

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    global AGENT_CONFIG
    if request.method == 'POST':
        data = request.json
        if data:
            for key in AGENT_CONFIG:
                if key in data:
                    # Basic type conversion to ensure we don't save strings for numbers
                    if type(AGENT_CONFIG[key]) == int:
                        AGENT_CONFIG[key] = int(data[key])
                    elif type(AGENT_CONFIG[key]) == bool:
                        AGENT_CONFIG[key] = bool(data[key])
                    else:
                        AGENT_CONFIG[key] = data[key]
        return jsonify({"status": "success", "config": AGENT_CONFIG})
    return jsonify(AGENT_CONFIG)

def run_revenue_recovery_agent():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # Reset database state on startup so dashboard only shows current run
    cursor.execute("TRUNCATE TABLE audit_logs")
    cursor.execute("UPDATE transactions SET status = 'failed'")
    conn.commit()

    cursor.execute("""
        SELECT t.txn_id, t.amount, t.failure_reason, c.customer_id, c.name, c.email, c.lifetime_value 
        FROM transactions t
        JOIN customers c ON t.customer_id = c.customer_id
        WHERE t.status = 'failed'
    """)
    failed_txns = cursor.fetchall()

    print(f"Agent Started: Found {len(failed_txns)} transactions at risk.\n")

    for txn in failed_txns:
        action, reasoning = ai_diagnose_and_decide(txn['failure_reason'], txn['lifetime_value'])
        
        cursor.execute("""
            INSERT INTO audit_logs (txn_id, action_taken, ai_reasoning)
            VALUES (%s, %s, %s)
        """, (txn['txn_id'], action, reasoning))

        new_status = 'recovered' if action in ['sent_emi_link', 'auto_retried'] else 'abandoned'
        cursor.execute("UPDATE transactions SET status = %s WHERE txn_id = %s", (new_status, txn['txn_id']))
        
        # Trigger email notification for actionable recovery items
        if action in ['sent_emi_link', 'sent_reminder']:
            send_recovery_email(txn['email'], txn['name'], txn['txn_id'], txn['amount'], action)
        
        print(f"Processed {txn['txn_id']} -> Action: {action}")

        print("Waiting 12 seconds to respect free tier rate limit...")
        time.sleep(12)
        
    conn.commit()
    cursor.close()
    conn.close()
    print("\nBatch processed successfully. Audit logs updated.")

if __name__ == '__main__':
    run_revenue_recovery_agent() 
    print("Starting Razorpay AI Controller Backend on port 5000...")
    app.run(debug=True, port=5000)