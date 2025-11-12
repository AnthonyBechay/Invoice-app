-- Add performance indexes for common query patterns

-- Document indexes
CREATE INDEX IF NOT EXISTS "Document_status_idx" ON "Document"("status");
CREATE INDEX IF NOT EXISTS "Document_userId_type_idx" ON "Document"("userId", "type");
CREATE INDEX IF NOT EXISTS "Document_userId_status_idx" ON "Document"("userId", "status");
CREATE INDEX IF NOT EXISTS "Document_userId_type_status_idx" ON "Document"("userId", "type", "status");
CREATE INDEX IF NOT EXISTS "Document_date_idx" ON "Document"("date");
CREATE INDEX IF NOT EXISTS "Document_userId_date_idx" ON "Document"("userId", "date");
CREATE INDEX IF NOT EXISTS "Document_createdAt_idx" ON "Document"("createdAt");
CREATE INDEX IF NOT EXISTS "Document_userId_createdAt_idx" ON "Document"("userId", "createdAt");

-- Payment indexes
CREATE INDEX IF NOT EXISTS "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_paymentDate_idx" ON "Payment"("paymentDate");
CREATE INDEX IF NOT EXISTS "Payment_userId_paymentDate_idx" ON "Payment"("userId", "paymentDate");

-- Client indexes
CREATE INDEX IF NOT EXISTS "Client_userId_createdAt_idx" ON "Client"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Client_name_idx" ON "Client"("name");

-- Stock indexes
CREATE INDEX IF NOT EXISTS "Stock_userId_createdAt_idx" ON "Stock"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Stock_name_idx" ON "Stock"("name");

-- Expense indexes
CREATE INDEX IF NOT EXISTS "Expense_userId_expenseDate_idx" ON "Expense"("userId", "expenseDate");
CREATE INDEX IF NOT EXISTS "Expense_expenseDate_idx" ON "Expense"("expenseDate");

