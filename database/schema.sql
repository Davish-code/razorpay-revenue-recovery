CREATE DATABASE IF NOT EXISTS razorpay_db;
USE razorpay_db;

-- 1. Create Customers Table
CREATE TABLE IF NOT EXISTS customers (
    customer_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    lifetime_value DECIMAL(10, 2) DEFAULT 0.00
);

-- 2. Create Transactions Table (The money at risk)
CREATE TABLE IF NOT EXISTS transactions (
    txn_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50),
    amount DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'failed', -- 'failed', 'abandoned', 'recovered'
    failure_reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- 3. Create Audit Logs Table (The Bar: Explainable AI actions and stopping rules)
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    txn_id VARCHAR(50),
    action_taken VARCHAR(100), -- e.g., 'sent_payment_link', 'auto_retried', 'stopped_contacting'
    ai_reasoning TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (txn_id) REFERENCES transactions(txn_id)
);

-- Insert Dummy Customers
INSERT INTO customers (customer_id, name, email, phone, lifetime_value) VALUES
('CUST001', 'Amit Kumar', 'amit@example.com', '9876543210', 15000.00),
('CUST002', 'Rahul Sharma', 'rahul@example.com', '9876543211', 2000.00),
('CUST003', 'Priya Singh', 'priya@example.com', '9876543212', 45000.00),
('CUST004', 'Neha Gupta', 'neha@example.com', '9876543213', 500.00),
('CUST005', 'Vikram Verma', 'vikram@example.com', '9876543214', 12000.00);

-- Insert Dummy Failed/Abandoned Transactions for AI to process
INSERT INTO transactions (txn_id, customer_id, amount, status, failure_reason) VALUES
('TXN1001', 'CUST001', 5000.00, 'failed', 'insufficient_funds'),
('TXN1002', 'CUST002', 1200.00, 'failed', 'bank_timeout'),
('TXN1003', 'CUST003', 25000.00, 'failed', 'high_risk_flagged'),
('TXN1004', 'CUST004', 800.00, 'abandoned', 'user_closed_checkout'),
('TXN1005', 'CUST005', 3500.00, 'failed', 'card_declined_limit_exceeded');