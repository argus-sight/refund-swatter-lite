# Quick Setup Guide

## One-Click Deployment

This project now uses a single configuration file for all settings.

### Steps:

1. **Copy the configuration template:**
   ```bash
   cp .env.project.example .env.project
   ```

2. **Edit `.env.project` with your Supabase credentials:**
   ```bash
   # Required fields:
   SUPABASE_PROJECT_REF=your-20-char-project-ref
   SUPABASE_DB_PASSWORD=your-database-password
   ```

3. **Run the setup script:**
   ```bash
   ./setup.sh
   ```

That's it! The script will:
- Link your Supabase project
- Apply database migrations
- Deploy Edge Functions
- Setup cron jobs
- Create admin user
- Generate all necessary .env files

### Configuration Options

All settings are in `.env.project`:
- `AUTO_CONFIRM=true` - Skip confirmation prompts
- `DEPLOY_FUNCTIONS=false` - Skip Edge Functions deployment
- `SETUP_CRON=false` - Skip cron job setup

### Switching Projects

To deploy to a different Supabase project:
1. Edit `.env.project` with new project credentials
2. Run `./setup.sh` again

### Files Generated

The setup script automatically generates:
- `.env` - Root environment file
- `web/.env` - Web application environment
- All keys are retrieved automatically from Supabase

### Important Notes

- Never commit `.env.project` to git (it contains passwords)
- `.env.project.example` is safe to commit
- `config.toml` is now generic and safe to commit
- All generated `.env` files are git-ignored