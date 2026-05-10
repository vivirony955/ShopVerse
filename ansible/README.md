# ShopVerse — Ansible Deployment

Fully automated deployment of the ShopVerse e-commerce stack to Ubuntu servers.

## What it installs on each server

| Component | Software |
|-----------|----------|
| All servers | Node.js LTS, PM2, Nginx, UFW |
| Database server | PostgreSQL 14–16, user + DB created |
| Backend server | NestJS app, Prisma migrations, admin seed |
| Frontend server | Next.js build, static asset caching |

> All three services can run on a **single server** by supplying the same IP for all three prompts.

---

## Prerequisites  (on your local machine)

```bash
# macOS
brew install ansible

# Ubuntu / Debian
sudo apt install ansible

# pip (any OS)
pip3 install ansible
```

Your target servers need:
- Ubuntu 22.04 or 24.04
- SSH access with a key (`~/.ssh/id_rsa` or custom)
- The SSH user must have `sudo` without a password (common for cloud VMs)

---

## Quick start

```bash
cd ansible
chmod +x deploy.sh
./deploy.sh
```

The wizard will ask for:
1. Frontend / Backend / Database server IPs
2. SSH username and key path
3. App ports (default 4000 backend, 3000 frontend)
4. Database name, user, password
5. JWT secret, NextAuth secret
6. Stripe keys
7. Admin seed email + password
8. Optional domain names (for Nginx `server_name`)
9. Whether to install Certbot / Let's Encrypt
10. Whether to run Prisma migrations and admin seed

---

## Re-deploy / update

Just run `./deploy.sh` again with the same answers.
Ansible is idempotent — unchanged tasks are skipped.

---

## Manual run (after first deploy)

If `inventory.ini` and `deploy_vars.yml` already exist:

```bash
# Full re-deploy
ansible-playbook -i inventory.ini --extra-vars "@deploy_vars.yml" site.yml

# Only backend
ansible-playbook -i inventory.ini --extra-vars "@deploy_vars.yml" site.yml --limit backend

# Only frontend
ansible-playbook -i inventory.ini --extra-vars "@deploy_vars.yml" site.yml --limit frontend

# Only database
ansible-playbook -i inventory.ini --extra-vars "@deploy_vars.yml" site.yml --limit database

# Verbose mode (for debugging)
ansible-playbook -i inventory.ini --extra-vars "@deploy_vars.yml" site.yml -vvv
```

---

## Managing services on the server

SSH into any server and use PM2:

```bash
pm2 list                    # show all running processes
pm2 logs                    # tail all logs
pm2 logs shopverse-backend  # tail backend logs only
pm2 logs shopverse-frontend # tail frontend logs only
pm2 restart shopverse-backend
pm2 restart shopverse-frontend
pm2 stop all
pm2 reload shopverse-frontend   # zero-downtime reload
```

---

## File structure

```
ansible/
├── deploy.sh               ← Interactive wizard (run this)
├── site.yml                ← Main playbook
├── ansible.cfg             ← Ansible settings
├── .gitignore              ← Excludes inventory.ini & deploy_vars.yml (secrets)
├── group_vars/
│   └── all.yml             ← Default variable values
└── roles/
    ├── common/             ← Node.js, PM2, Nginx, UFW (all servers)
    ├── database/           ← PostgreSQL setup
    ├── backend/            ← NestJS deploy + Prisma + PM2 + Nginx
    └── frontend/           ← Next.js build + PM2 + Nginx
```

> `inventory.ini` and `deploy_vars.yml` are **auto-generated** by `deploy.sh`
> and are excluded from git because they contain secrets.
