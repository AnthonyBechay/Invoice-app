-- AlterTable: Update Payment.documentId foreign key to CASCADE delete
-- This ensures payments are automatically deleted when their associated document is deleted

-- Drop the existing foreign key constraint
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_documentId_fkey";

-- Recreate the foreign key constraint with CASCADE delete
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_documentId_fkey" 
  FOREIGN KEY ("documentId") 
  REFERENCES "Document"("id") 
  ON DELETE CASCADE 
  ON UPDATE CASCADE;

