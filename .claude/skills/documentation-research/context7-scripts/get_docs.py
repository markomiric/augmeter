#!/usr/bin/env python3
# /// script
# dependencies = [
#   "httpx>=0.27.0",
# ]
# ///
"""
Fetch up-to-date documentation for a library from Context7.

This script retrieves current, version-specific documentation and code
examples for any library in the Context7 database.

Usage:
    uv run get_docs.py "/org/library"
    uv run get_docs.py "/org/library" --topic "feature"
    uv run get_docs.py "/org/library" --tokens 10000
    
Arguments:
    library_id      Context7-compatible library ID (from resolve_library.py)
                    Format: /org/project or /org/project/version
                    
Options:
    --topic TEXT    Focus documentation on specific topic/feature
                    Examples: "authentication", "routing", "hooks"
                    
    --tokens INT    Maximum documentation tokens to return
                    Default: 5000
                    Minimum: 1000 (automatically enforced by Context7)
                    Use higher values for comprehensive docs
    
Returns:
    Current documentation and code examples from Context7 database
    
Examples:
    # Get Next.js documentation (default 5000 tokens)
    $ uv run get_docs.py "/vercel/next.js"
    
    # Get React Query docs focused on mutations
    $ uv run get_docs.py "/tanstack/query" --topic "mutations"
    
    # Get comprehensive Supabase auth docs (10K tokens)
    $ uv run get_docs.py "/supabase/supabase" --topic "authentication" --tokens 10000
    
    # Get specific version docs
    $ uv run get_docs.py "/vercel/next.js/v15.0.0"

Notes:
    - First resolve library name with resolve_library.py if you don't have the ID
    - Use --topic to focus on specific features (saves tokens, more relevant)
    - Increase --tokens for comprehensive documentation needs
    - Documentation is fetched fresh each time (no caching)
"""

import sys
import json
import httpx

# Fix Windows console encoding for Unicode characters
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Context7 API Configuration
CONTEXT7_API_URL = "https://mcp.context7.com/mcp"
# Optional: Set API key for higher rate limits
# Get yours at: https://context7.com/dashboard
CONTEXT7_API_KEY = None  # Set to your key or leave None for basic access

def get_library_docs(
    library_id: str,
    topic: str = None,
    tokens: int = 5000
) -> dict:
    """
    Call Context7 API to fetch library documentation.
    
    Args:
        library_id: Context7-compatible library ID (e.g., "/vercel/next.js")
        topic: Optional topic to focus documentation on
        tokens: Maximum tokens to return (default 5000, min 1000)
        
    Returns:
        Dict with documentation content from Context7 API
    """
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    
    if CONTEXT7_API_KEY:
        headers["CONTEXT7_API_KEY"] = CONTEXT7_API_KEY
    
    # Build arguments for Context7 MCP tool call
    arguments = {
        "context7CompatibleLibraryID": library_id,
        "tokens": max(tokens, 1000)  # Context7 enforces minimum 1000
    }
    
    if topic:
        arguments["topic"] = topic
    
    # MCP tool call format for Context7
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "get-library-docs",
            "arguments": arguments
        }
    }
    
    try:
        print(f"Fetching documentation from Context7...", file=sys.stderr)
        if topic:
            print(f"Topic: {topic}", file=sys.stderr)
        print(f"Token limit: {tokens}", file=sys.stderr)
        print(file=sys.stderr)
        
        response = httpx.post(
            CONTEXT7_API_URL,
            json=payload,
            headers=headers,
            timeout=60.0  # Longer timeout for large docs
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        print(f"ERROR: HTTP {e.response.status_code}", file=sys.stderr)
        print(f"Response: {e.response.text}", file=sys.stderr)
        if "No valid session ID provided" in e.response.text:
            print("\nThis legacy script cannot use Context7 session-backed endpoints.", file=sys.stderr)
            print("Use the Context7 MCP tool mcp__context7__get-library-docs instead.", file=sys.stderr)

        if e.response.status_code == 404:
            print("\nTroubleshooting:", file=sys.stderr)
            print(f"1. Library ID '{library_id}' not found in Context7", file=sys.stderr)
            print(f"2. Verify ID with: uv run resolve_library.py \"library name\"", file=sys.stderr)
            print(f"3. Check ID format: /org/project or /org/project/version", file=sys.stderr)
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"ERROR: Request failed: {e}", file=sys.stderr)
        print("\nTroubleshooting:", file=sys.stderr)
        print("1. Check your internet connection", file=sys.stderr)
        print("2. Verify Context7 API is accessible", file=sys.stderr)
        print("3. Try again with a lower --tokens value", file=sys.stderr)
        sys.exit(1)

def format_documentation(response: dict, library_id: str) -> None:
    """
    Format and display Context7 documentation.
    
    Args:
        response: Raw JSON response from Context7 API
        library_id: Library ID for context
    """
    if "result" not in response:
        print(f"No documentation found for '{library_id}'", file=sys.stderr)
        sys.exit(1)
    
    result = response["result"]
    
    # Context7 returns documentation in 'content' array
    if "content" in result and len(result["content"]) > 0:
        content = result["content"][0]
        if "text" in content:
            # Print the documentation from Context7
            print(content["text"])
        else:
            print(f"Found results but no text content", file=sys.stderr)
            print(f"Raw response: {json.dumps(result, indent=2)}")
    else:
        print(f"Unexpected response format from Context7", file=sys.stderr)
        print(f"Raw response: {json.dumps(result, indent=2)}")

def fix_git_bash_path(path: str) -> str:
    """
    Fix Git Bash path conversion issue on Windows.

    Git Bash converts /org/project to C:/Program Files/Git/org/project.
    This function detects and reverses that conversion.
    """
    # Common Git installation paths that Git Bash prepends
    git_prefixes = [
        'C:/Program Files/Git',
        'C:/Program Files (x86)/Git',
        '/c/Program Files/Git',
        '/c/Program Files (x86)/Git',
    ]

    for prefix in git_prefixes:
        if path.startswith(prefix):
            # Extract the original path after the Git prefix
            return path[len(prefix):]

    return path

def parse_arguments():
    """Parse command line arguments."""
    if len(sys.argv) < 2 or sys.argv[1] in ['-h', '--help', 'help']:
        print(__doc__)
        sys.exit(0 if len(sys.argv) < 2 else 1)

    library_id = sys.argv[1]

    # Fix Git Bash path conversion on Windows
    library_id = fix_git_bash_path(library_id)

    # Validate library ID format
    if not library_id.startswith('/'):
        print(f"ERROR: Invalid library ID format: '{library_id}'", file=sys.stderr)
        print(f"Expected format: /org/project or /org/project/version", file=sys.stderr)
        print(f"\nGet correct ID with: uv run resolve_library.py \"library name\"", file=sys.stderr)
        sys.exit(1)
    
    # Parse optional arguments
    topic = None
    tokens = 5000
    
    i = 2
    while i < len(sys.argv):
        arg = sys.argv[i]
        
        if arg == '--topic' and i + 1 < len(sys.argv):
            topic = sys.argv[i + 1]
            i += 2
        elif arg == '--tokens' and i + 1 < len(sys.argv):
            try:
                tokens = int(sys.argv[i + 1])
                if tokens < 1000:
                    print(f"WARNING: Token count {tokens} too low, using minimum 1000", file=sys.stderr)
                    tokens = 1000
            except ValueError:
                print(f"ERROR: Invalid --tokens value: {sys.argv[i + 1]}", file=sys.stderr)
                sys.exit(1)
            i += 2
        else:
            print(f"ERROR: Unknown argument: {arg}", file=sys.stderr)
            print("\nValid options: --topic TEXT, --tokens INT", file=sys.stderr)
            sys.exit(1)
    
    return library_id, topic, tokens

def main():
    """Main entry point for documentation fetching."""
    # Parse arguments
    library_id, topic, tokens = parse_arguments()
    
    # Call Context7 API
    response = get_library_docs(library_id, topic, tokens)
    
    # Format and display documentation
    format_documentation(response, library_id)

if __name__ == "__main__":
    main()
