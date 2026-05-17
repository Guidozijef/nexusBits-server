-- ============================================================
-- NexusBits DB Migration: Add Product Cost Field
-- Please run this script in your Supabase SQL Editor
-- ============================================================

-- Add `cost` column to `products` table for backend recording
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00;
