# Database Setup Guide

This directory contains all SQL files for the Logistix application database schema.

## Structure

- **`schema.sql`** - Main schema file containing all table definitions, functions, and policies. Run this file first.
- **`tables/`** - Individual table definitions organized by functionality
- **`functions/`** - Database functions
- **`policies/`** - Row Level Security (RLS) policies
- **`migrations/`** - Migration scripts for existing databases

## Quick Setup

### For New Databases

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `schema.sql`
4. Click **Run** to execute

This will create all necessary tables, indexes, functions, and policies.

### For Existing Databases

If you're adding new features to an existing database:

1. **Customers Table** (for Sales tab):
   - Run `tables/customers.sql` in Supabase SQL Editor

2. **Status Column** (if consoles table exists but status column is missing):
   - Run `migrations/add_status_column_to_consoles.sql`

## Table Descriptions

### Core Tables
- **`orders`** - Order information
- **`cartons`** - Carton details for each order
- **`app_users`** - User accounts (admin and regular users)
- **`consoles`** - Console/container information
- **`console_orders`** - Junction table linking consoles to orders
- **`customers`** - Customer information for sales management
- **`serial_counter`** - Tracks serial number generation

## Troubleshooting

### Error: "relation does not exist" or "table does not exist"

This means the table hasn't been created yet. Run the appropriate SQL file from the `tables/` directory.

### Error: "column does not exist"

This means you need to run a migration script from the `migrations/` directory.

### Error: "permission denied"

Make sure you're using the Service Role key in your environment variables for admin operations.

## Environment Variables Required

Make sure these are set in your `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
