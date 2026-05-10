#!/usr/bin/env bash
# ============================================================
#  ShopVerse — Interactive Ansible Deployment Script
#  Prompts for all configuration, generates inventory + vars,
#  then launches ansible-playbook.
# ============================================================
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m';  GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;36m'; BOLD='\033[1m';     NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Helpers ───────────────────────────────────────────────────
banner() {
  echo -e "\n${BOLD}${BLUE}── $1 ──${NC}"
}

ask() {           # ask <prompt> <default> <var>
  local prompt="$1" default="$2" var="$3"
  local hint=""
  [ -n "$default" ] && hint=" [${GREEN}${default}${NC}]"
  read -rp "$(echo -e "  ${YELLOW}${prompt}${hint}${NC}: ")" val
  eval "${var}='${val:-${default}}'"
}

ask_secret() {    # ask_secret <prompt> <var>
  local prompt="$1" var="$2" val=""
  read -rsp "$(echo -e "  ${YELLOW}${prompt}${NC}: ")" val; echo
  while [ -z "$val" ]; do
    echo -e "  ${RED}This field is required.${NC}"
    read -rsp "$(echo -e "  ${YELLOW}${prompt}${NC}: ")" val; echo
  done
  eval "${var}='${val}'"
}

ask_required() {  # ask_required <prompt> <var>
  local prompt="$1" var="$2" val=""
  read -rp "$(echo -e "  ${YELLOW}${prompt}${NC} ${RED}(required)${NC}: ")" val
  while [ -z "$val" ]; do
    echo -e "  ${RED}This field is required.${NC}"
    read -rp "$(echo -e "  ${YELLOW}${prompt}${NC} ${RED}(required)${NC}: ")" val
  done
  eval "${var}='${val}'"
}

check_ansible() {
  if ! command -v ansible-playbook &>/dev/null; then
    echo -e "${RED}Error: ansible-playbook not found.${NC}"
    echo    "Install Ansible: https://docs.ansible.com/ansible/latest/installation_guide/"
    echo    "  Ubuntu/Debian:  sudo apt install ansible"
    echo    "  macOS:          brew install ansible"
    echo    "  pip:            pip3 install ansible"
    exit 1
  fi
}

# ── Banner ────────────────────────────────────────────────────
clear
echo -e "${BOLD}${BLUE}"
cat << 'EOF'
  ╔══════════════════════════════════════════════════════╗
  ║        ShopVerse  —  Ansible Deployment Wizard       ║
  ║  Installs Node.js, PostgreSQL, PM2, Nginx + app      ║
  ╚══════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo "  This wizard prompts for all configuration options,"
echo "  generates the Ansible inventory + vars files, and"
echo "  runs the full deployment across your servers."
echo
echo -e "  ${YELLOW}Tip:${NC} Use the same IP for all three services to deploy"
echo   "       everything on a single machine."
echo

check_ansible

# ════════════════════════════════════════════════════════
banner "1 · Server IP Addresses"
echo
# ════════════════════════════════════════════════════════
ask_required "Frontend server IP (where Next.js runs)" FRONTEND_IP
ask_required "Backend server IP  (where NestJS runs)"  BACKEND_IP
ask_required "Database server IP (where PostgreSQL runs)" DB_IP

# Warn on single-server mode without domains
if [ "$FRONTEND_IP" = "$BACKEND_IP" ] && [ -z "${FRONTEND_DOMAIN:-}" ] && [ -z "${BACKEND_DOMAIN:-}" ]; then
  echo
  echo -e "  ${YELLOW}Note:${NC} Frontend + Backend on the same IP."
  echo   "  You will need distinct domains OR the backend will be served"
  echo   "  on a sub-path (/api/). You can set domains in the 'Domain' section."
fi

# ════════════════════════════════════════════════════════
banner "2 · SSH Access"
echo
# ════════════════════════════════════════════════════════
ask "SSH username on all servers" "ubuntu" SSH_USER
ask "Path to SSH private key"     "~/.ssh/id_rsa" SSH_KEY

# ════════════════════════════════════════════════════════
banner "3 · Application Ports"
echo
# ════════════════════════════════════════════════════════
ask "Backend port  (NestJS)"  "4000" BACKEND_PORT
ask "Frontend port (Next.js)" "3000" FRONTEND_PORT

# ════════════════════════════════════════════════════════
banner "4 · Database Configuration"
echo
# ════════════════════════════════════════════════════════
ask "PostgreSQL database name" "shopverse" DB_NAME
ask "PostgreSQL user"          "shopverse" DB_USER
ask_secret "PostgreSQL password (hidden)" DB_PASSWORD

# ════════════════════════════════════════════════════════
banner "5 · Application Secrets"
echo
# ════════════════════════════════════════════════════════
echo -e "  ${YELLOW}Hint:${NC} Use a random 32+ character string for secrets."
echo   "  Generate one:  openssl rand -hex 32"
echo
ask_secret "JWT secret  (NestJS token signing)" JWT_SECRET
ask_secret "NextAuth secret (Next.js sessions)"  NEXTAUTH_SECRET

# ════════════════════════════════════════════════════════
banner "6 · Stripe Payment Keys"
echo
# ════════════════════════════════════════════════════════
echo   "  Leave blank / press Enter to use placeholder test keys."
echo
ask "Stripe publishable key (pk_...)" "pk_test_placeholder" STRIPE_PUB_KEY
ask_secret "Stripe secret key (sk_...)"       STRIPE_SECRET_KEY
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_placeholder}"
ask_secret "Stripe webhook secret (whsec_...)" STRIPE_WEBHOOK_SECRET
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-whsec_placeholder}"

# ════════════════════════════════════════════════════════
banner "7 · Admin Seed Account"
echo
# ════════════════════════════════════════════════════════
echo   "  This account is created automatically on first deploy."
echo
ask          "Admin email"    "admin@shopverse.com" SEED_ADMIN_EMAIL
ask_secret   "Admin password (min 8 chars)" SEED_ADMIN_PASSWORD

# ════════════════════════════════════════════════════════
banner "8 · Domain Names  (optional — needed for HTTPS)"
echo
# ════════════════════════════════════════════════════════
echo   "  Leave blank to use raw IP addresses."
echo
ask "Frontend domain  e.g. shop.example.com"  "" FRONTEND_DOMAIN
ask "Backend domain   e.g. api.example.com"   "" BACKEND_DOMAIN

# ════════════════════════════════════════════════════════
banner "9 · Infrastructure Options"
echo
# ════════════════════════════════════════════════════════
ask "Node.js major version"            "20"               NODE_VERSION
ask "App install directory on servers" "/opt/shopverse"   APP_DIR
ask "Run Prisma migrations?  (yes/no)" "yes"              RUN_MIGRATIONS
ask "Seed admin user?        (yes/no)" "yes"              RUN_SEED
ask "Install Certbot (Let's Encrypt)? (yes/no)" "no"      INSTALL_CERTBOT

# ════════════════════════════════════════════════════════
#  Derived values
# ════════════════════════════════════════════════════════
# CORS origins — include both domain and IP
if [ -n "$FRONTEND_DOMAIN" ]; then
  CORS_ORIGINS="http://${FRONTEND_DOMAIN},https://${FRONTEND_DOMAIN},http://${FRONTEND_IP}:${FRONTEND_PORT}"
else
  CORS_ORIGINS="http://${FRONTEND_IP}:${FRONTEND_PORT},http://${FRONTEND_IP}"
fi

# Backend API URL for Next.js
if [ -n "$BACKEND_DOMAIN" ]; then
  BACKEND_API_URL="http://${BACKEND_DOMAIN}/api"
else
  BACKEND_API_URL="http://${BACKEND_IP}:${BACKEND_PORT}/api"
fi

# NextAuth URL
if [ -n "$FRONTEND_DOMAIN" ]; then
  NEXTAUTH_URL="http://${FRONTEND_DOMAIN}"
else
  NEXTAUTH_URL="http://${FRONTEND_IP}:${FRONTEND_PORT}"
fi

# Single-server flag
SINGLE_SERVER="false"
[ "$FRONTEND_IP" = "$BACKEND_IP" ] && [ "$BACKEND_IP" = "$DB_IP" ] && SINGLE_SERVER="true"

# ════════════════════════════════════════════════════════
#  Summary
# ════════════════════════════════════════════════════════
echo
echo -e "${BOLD}${BLUE}  ╔══════════════════════════════════════════════════╗"
echo -e "  ║              Deployment Summary                  ║"
echo -e "  ╚══════════════════════════════════════════════════╝${NC}"
echo
printf "  %-22s %s\n" "Frontend:"  "${GREEN}http://${FRONTEND_IP}:${FRONTEND_PORT}${NC}"
printf "  %-22s %s\n" "Backend:"   "${GREEN}http://${BACKEND_IP}:${BACKEND_PORT}/api${NC}"
printf "  %-22s %s\n" "Database:"  "${GREEN}${DB_IP}:5432 / ${DB_NAME}${NC}"
printf "  %-22s %s\n" "SSH user:"  "${GREEN}${SSH_USER}${NC}"
printf "  %-22s %s\n" "Node.js:"   "${GREEN}v${NODE_VERSION}.x${NC}"
printf "  %-22s %s\n" "App dir:"   "${GREEN}${APP_DIR}${NC}"
[ -n "$FRONTEND_DOMAIN" ] && printf "  %-22s %s\n" "Frontend domain:" "${GREEN}${FRONTEND_DOMAIN}${NC}"
[ -n "$BACKEND_DOMAIN"  ] && printf "  %-22s %s\n" "Backend domain:"  "${GREEN}${BACKEND_DOMAIN}${NC}"
printf "  %-22s %s\n" "Migrations:" "${GREEN}${RUN_MIGRATIONS}${NC}"
printf "  %-22s %s\n" "Seed admin:" "${GREEN}${RUN_SEED}${NC}"
[ "$SINGLE_SERVER" = "true" ] && echo -e "\n  ${YELLOW}⚡ Single-server mode detected${NC}"
echo
read -rp "$(echo -e "  ${BOLD}Proceed with deployment?${NC} [${GREEN}yes${NC}/no]: ")" CONFIRM
CONFIRM="${CONFIRM:-yes}"
if [[ ! "$CONFIRM" =~ ^[Yy] ]]; then
  echo -e "  ${RED}Deployment cancelled.${NC}"; exit 1
fi

# ════════════════════════════════════════════════════════
#  Generate inventory.ini
# ════════════════════════════════════════════════════════
INVENTORY_FILE="${SCRIPT_DIR}/inventory.ini"

cat > "$INVENTORY_FILE" << EOF
# Auto-generated by deploy.sh — do not edit manually, re-run deploy.sh

[frontend]
frontend-server ansible_host=${FRONTEND_IP}

[backend]
backend-server ansible_host=${BACKEND_IP}

[database]
db-server ansible_host=${DB_IP}

[shopverse:children]
frontend
backend
database

[all:vars]
ansible_user=${SSH_USER}
ansible_ssh_private_key_file=${SSH_KEY}
ansible_ssh_common_args='-o StrictHostKeyChecking=no -o ConnectTimeout=30'
ansible_python_interpreter=/usr/bin/python3
EOF

echo -e "  ${GREEN}✓ inventory.ini generated${NC}"

# ════════════════════════════════════════════════════════
#  Generate deploy_vars.yml  (secrets written as strings)
# ════════════════════════════════════════════════════════
VARS_FILE="${SCRIPT_DIR}/deploy_vars.yml"

# Escape single quotes in passwords for YAML
escape_yaml() { echo "$1" | sed "s/'/''/" ; }

cat > "$VARS_FILE" << EOF
---
# Auto-generated by deploy.sh — contains secrets, do not commit to git

# ── Hosts
frontend_ip: '${FRONTEND_IP}'
backend_ip:  '${BACKEND_IP}'
db_ip:       '${DB_IP}'

# ── Ports & paths
backend_port:  ${BACKEND_PORT}
frontend_port: ${FRONTEND_PORT}
app_dir:       '${APP_DIR}'
node_version:  '${NODE_VERSION}'

# ── Database
db_name:     '${DB_NAME}'
db_user:     '${DB_USER}'
db_password: '$(escape_yaml "${DB_PASSWORD}")'

# ── Backend secrets
jwt_secret:             '$(escape_yaml "${JWT_SECRET}")'
stripe_secret_key:      '$(escape_yaml "${STRIPE_SECRET_KEY}")'
stripe_webhook_secret:  '$(escape_yaml "${STRIPE_WEBHOOK_SECRET}")'
cors_origins:           '${CORS_ORIGINS}'
seed_admin_email:       '${SEED_ADMIN_EMAIL}'
seed_admin_password:    '$(escape_yaml "${SEED_ADMIN_PASSWORD}")'

# ── Frontend secrets
nextauth_secret:        '$(escape_yaml "${NEXTAUTH_SECRET}")'
nextauth_url:           '${NEXTAUTH_URL}'
backend_api_url:        '${BACKEND_API_URL}'
stripe_publishable_key: '${STRIPE_PUB_KEY}'

# ── Domains (empty string = use IP)
frontend_domain: '${FRONTEND_DOMAIN}'
backend_domain:  '${BACKEND_DOMAIN}'

# ── Flags
run_migrations:    $([ "$RUN_MIGRATIONS" = "yes" ] && echo true || echo false)
run_seed:          $([ "$RUN_SEED" = "yes" ] && echo true || echo false)
install_certbot:   $([ "$INSTALL_CERTBOT" = "yes" ] && echo true || echo false)
single_server:     ${SINGLE_SERVER}
EOF

echo -e "  ${GREEN}✓ deploy_vars.yml generated${NC}"
echo   "  ${YELLOW}⚠  Keep deploy_vars.yml private — it contains secrets.${NC}"
echo

# ════════════════════════════════════════════════════════
#  Run Ansible
# ════════════════════════════════════════════════════════
echo -e "${BOLD}${BLUE}  Starting Ansible deployment...${NC}"
echo

set +e
ansible-playbook \
  -i  "${INVENTORY_FILE}"  \
  --extra-vars "@${VARS_FILE}" \
  "${SCRIPT_DIR}/site.yml" \
  -v
ANSIBLE_EXIT=$?
set -e

echo
if [ $ANSIBLE_EXIT -eq 0 ]; then
  echo -e "${BOLD}${GREEN}"
  cat << 'EOF'
  ╔══════════════════════════════════════════════════╗
  ║        ✅  Deployment Successful!               ║
  ╚══════════════════════════════════════════════════╝
EOF
  echo -e "${NC}"
  echo -e "  Frontend : ${BLUE}${NEXTAUTH_URL}${NC}"
  echo -e "  Backend  : ${BLUE}${BACKEND_API_URL}${NC}"
  echo -e "  Admin    : ${BLUE}${SEED_ADMIN_EMAIL}${NC}"
  echo
  echo   "  Manage processes on each server:"
  echo   "    pm2 list          — see running apps"
  echo   "    pm2 logs          — tail all logs"
  echo   "    pm2 restart all   — restart services"
else
  echo -e "${RED}  ✗ Deployment failed (exit ${ANSIBLE_EXIT}).${NC}"
  echo   "  Check the output above for errors."
  echo   "  Re-run with -vvv for verbose output:"
  echo   "    ansible-playbook -i inventory.ini --extra-vars @deploy_vars.yml site.yml -vvv"
  exit $ANSIBLE_EXIT
fi
