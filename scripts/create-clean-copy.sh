#!/bin/bash
#
# create-clean-copy.sh
# =====================
# Creates a clean copy of the project for OSS release.
# Excludes: .git/, AI development artifacts, and sensitive files.
#
# Usage:
#   ./scripts/create-clean-copy.sh <destination>
#   ./scripts/create-clean-copy.sh --dry-run <destination>
#   ./scripts/create-clean-copy.sh --check-secrets
#
# Examples:
#   ./scripts/create-clean-copy.sh ../swappy
#   ./scripts/create-clean-copy.sh --dry-run ../test-copy
#   ./scripts/create-clean-copy.sh --check-secrets
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
DRY_RUN=false
CHECK_SECRETS=false
DESTINATION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --check-secrets)
            CHECK_SECRETS=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS] <destination>"
            echo ""
            echo "Options:"
            echo "  --dry-run        Show what would be copied without copying"
            echo "  --check-secrets  Check for potential secrets in the project"
            echo "  -h, --help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 ../swappy"
            echo "  $0 --dry-run ../test-copy"
            echo "  $0 --check-secrets"
            exit 0
            ;;
        *)
            DESTINATION="$1"
            shift
            ;;
    esac
done

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check for secrets
check_secrets() {
    print_info "Checking for potential secrets in the project..."

    local found_issues=false

    # Patterns to check
    declare -a PATTERNS=(
        "sk-[a-zA-Z0-9]"           # OpenAI API keys
        "ghp_[a-zA-Z0-9]"          # GitHub Personal Access Tokens
        "gho_[a-zA-Z0-9]"          # GitHub OAuth Access Tokens
        "github_pat_[a-zA-Z0-9]"   # GitHub Fine-grained PATs
        "xox[baprs]-[a-zA-Z0-9]"   # Slack tokens
        "AKIA[0-9A-Z]"             # AWS Access Key IDs
        "eyJ[a-zA-Z0-9_-]*\."      # JWT tokens (base64)
        "-----BEGIN.*PRIVATE KEY" # Private keys
    )

    # Files to exclude from secret scanning
    local EXCLUDE_PATTERNS=(
        "*.lock"
        "node_modules"
        ".git"
        "*.log"
        "dist"
        ".env.example"
        "*.md"
    )

    # Build exclude args for grep
    local exclude_args=""
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        exclude_args="$exclude_args --exclude=$pattern --exclude-dir=$pattern"
    done

    echo ""
    echo "Scanning for potential secrets..."
    echo "=================================="

    for pattern in "${PATTERNS[@]}"; do
        local matches
        matches=$(grep -rn $exclude_args "$pattern" "$PROJECT_ROOT" 2>/dev/null || true)
        if [[ -n "$matches" ]]; then
            print_warning "Found potential secret matching pattern: $pattern"
            echo "$matches" | head -5
            echo ""
            found_issues=true
        fi
    done

    # Check for hardcoded API keys in common locations
    print_info "Checking for hardcoded values in source files..."

    # Check for specific strings that might be API keys
    local hardcoded_check
    hardcoded_check=$(grep -rn $exclude_args -E "(api_key|apiKey|API_KEY|secret|SECRET)\s*[:=]\s*['\"][^'\"]{20,}['\"]" "$PROJECT_ROOT/src" 2>/dev/null || true)
    if [[ -n "$hardcoded_check" ]]; then
        print_warning "Found potential hardcoded API keys in source files:"
        echo "$hardcoded_check"
        echo ""
        found_issues=true
    fi

    # Check for .env files that shouldn't be committed
    print_info "Checking for environment files..."
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        print_warning ".env file exists (should not be in clean copy)"
        found_issues=true
    fi
    if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
        print_warning ".env.local file exists (should not be in clean copy)"
        found_issues=true
    fi

    echo ""
    if [[ "$found_issues" == true ]]; then
        print_warning "Potential secrets found! Review the above before publishing."
        echo ""
        echo "Recommendations:"
        echo "  1. Remove any real API keys from source code"
        echo "  2. Use environment variables for all sensitive values"
        echo "  3. Ensure .env files are in .gitignore"
        return 1
    else
        print_success "No obvious secrets found."
        return 0
    fi
}

# Function to create clean copy
create_clean_copy() {
    local dest="$1"

    if [[ -z "$dest" ]]; then
        print_error "Destination directory is required."
        echo "Usage: $0 <destination>"
        exit 1
    fi

    # Check if destination exists
    if [[ -d "$dest" ]]; then
        print_warning "Destination directory already exists: $dest"
        read -p "Do you want to overwrite? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Aborted."
            exit 0
        fi
        rm -rf "$dest"
    fi

    # Create destination directory
    mkdir -p "$dest"

    print_info "Creating clean copy..."
    print_info "Source: $PROJECT_ROOT"
    print_info "Destination: $dest"
    echo ""

    # Define exclude patterns
    local EXCLUDES=(
        # Git
        ".git"

        # AI Development Tools
        ".serena"
        ".claude"
        ".claude-code-harness"
        ".claude-code-harness-version"
        "claudedocs"
        "Plans.md"
        "AGENTS.md"
        "*.session.json"
        "*.jsonl"
        ".qoder"
        ".kiri"
        ".playwright-mcp"

        # Environment files (secrets)
        ".env"
        ".env.local"
        ".env.development.local"
        ".env.test.local"
        ".env.production.local"

        # Build artifacts
        "node_modules"
        "dist"
        "dist-ssr"
        ".venv"

        # Editor/IDE
        ".vscode"
        ".idea"
        ".DS_Store"
        "*.sw?"

        # Misc
        "*.log"
        "npm-debug.log*"
        "yarn-debug.log*"
        "external"
        "backups"
        "payload.json"
        "backup_schema.sql"
        "deno.lock"

        # Package manager lockfiles (keep only npm)
        "bun.lockb"
        "yarn.lock"
    )

    # Build rsync exclude args
    local rsync_excludes=""
    for pattern in "${EXCLUDES[@]}"; do
        rsync_excludes="$rsync_excludes --exclude=$pattern"
    done

    if [[ "$DRY_RUN" == true ]]; then
        print_info "DRY RUN - showing what would be copied:"
        echo ""
        rsync -av --dry-run $rsync_excludes "$PROJECT_ROOT/" "$dest/" | head -100
        echo ""
        echo "... (truncated)"
        print_info "Use without --dry-run to actually copy files."
    else
        # Run rsync
        rsync -av $rsync_excludes "$PROJECT_ROOT/" "$dest/"

        echo ""
        print_success "Clean copy created at: $dest"
        echo ""

        # Post-copy verification
        print_info "Verifying clean copy..."

        # Check for files that shouldn't exist
        local issues=0

        if [[ -d "$dest/.git" ]]; then
            print_warning ".git directory found in clean copy!"
            issues=$((issues + 1))
        fi

        if [[ -f "$dest/.env" ]]; then
            print_warning ".env file found in clean copy!"
            issues=$((issues + 1))
        fi

        if [[ -d "$dest/.claude" ]]; then
            print_warning ".claude directory found in clean copy!"
            issues=$((issues + 1))
        fi

        if [[ -f "$dest/Plans.md" ]]; then
            print_warning "Plans.md found in clean copy!"
            issues=$((issues + 1))
        fi

        if [[ $issues -eq 0 ]]; then
            print_success "Verification passed! Clean copy is ready."
        else
            print_warning "$issues issue(s) found. Please review."
        fi

        echo ""
        echo "Next steps:"
        echo "  1. cd $dest"
        echo "  2. git init"
        echo "  3. git add ."
        echo "  4. git commit -m 'Initial commit: Swappy v0.1.0-beta'"
        echo "  5. git remote add origin https://github.com/YOUR_USERNAME/swappy.git"
        echo "  6. git push -u origin main"
    fi
}

# Main execution
main() {
    echo ""
    echo "======================================"
    echo "  Swappy - Clean Copy Tool"
    echo "======================================"
    echo ""

    cd "$PROJECT_ROOT"

    if [[ "$CHECK_SECRETS" == true ]]; then
        check_secrets
        exit $?
    fi

    if [[ -z "$DESTINATION" ]]; then
        print_error "Destination directory is required."
        echo ""
        echo "Usage: $0 [OPTIONS] <destination>"
        echo "       $0 --help for more information"
        exit 1
    fi

    # Run secret check first
    print_info "Running pre-flight secret check..."
    if ! check_secrets; then
        echo ""
        read -p "Secrets found. Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Aborted. Please fix the issues and try again."
            exit 1
        fi
    fi

    echo ""
    create_clean_copy "$DESTINATION"
}

main "$@"
