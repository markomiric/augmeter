#!/usr/bin/env python3
# /// script
# dependencies = [
#   "httpx>=0.27.0",
# ]
# ///
"""
Resolve library name to Context7-compatible library ID.

This script searches Context7's database to find matching libraries
and returns their official IDs for use with get_docs.py.

Usage:
    uv run resolve_library.py "library name"
    uv run resolve_library.py "next.js"
    uv run resolve_library.py "react query"
    
Arguments:
    library_name    Name of library to search for (e.g., "supabase", "next.js")
    
Returns:
    List of matching libraries with their Context7-compatible IDs
    Format: /org/project or /org/project/version
    
Examples:
    $ uv run resolve_library.py "next.js"
    Found 3 matches for 'next.js':
    
    1. Next.js
       ID: /vercel/next.js
       Latest: v15.0.0
       
    2. Next.js (v14)
       ID: /vercel/next.js/v14.0.0
       
    Use the ID with get_docs.py:
        uv run get_docs.py "/vercel/next.js"
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

def resolve_library_id(library_name: str) -> dict:
    """
    Call Context7 API to resolve library name to compatible IDs.
    
    Args:
        library_name: Name of the library to search for
        
    Returns:
        Dict with search results from Context7 API
    """
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    
    if CONTEXT7_API_KEY:
        headers["CONTEXT7_API_KEY"] = CONTEXT7_API_KEY
    
    # MCP tool call format for Context7
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "resolve-library-id",
            "arguments": {
                "libraryName": library_name
            }
        }
    }
    
    try:
        response = httpx.post(
            CONTEXT7_API_URL,
            json=payload,
            headers=headers,
            timeout=30.0
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        print(f"ERROR: HTTP {e.response.status_code}", file=sys.stderr)
        print(f"Response: {e.response.text}", file=sys.stderr)
        if "No valid session ID provided" in e.response.text:
            print("\nThis legacy script cannot use Context7 session-backed endpoints.", file=sys.stderr)
            print("Use the Context7 MCP tool mcp__context7__resolve-library-id instead.", file=sys.stderr)
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"ERROR: Request failed: {e}", file=sys.stderr)
        print("\nTroubleshooting:", file=sys.stderr)
        print("1. Check your internet connection", file=sys.stderr)
        print("2. Verify Context7 API is accessible", file=sys.stderr)
        print("3. Try again in a few moments", file=sys.stderr)
        sys.exit(1)

def format_results(response: dict, library_name: str) -> None:
    """
    Format and display Context7 search results.
    
    Args:
        response: Raw JSON response from Context7 API
        library_name: Original search query for context
    """
    if "result" not in response:
        print(f"No results found for '{library_name}'", file=sys.stderr)
        print("\nTips:", file=sys.stderr)
        print("- Try a more general name (e.g., 'react' instead of 'react.js')", file=sys.stderr)
        print("- Check spelling", file=sys.stderr)
        print("- Try the official package name", file=sys.stderr)
        sys.exit(1)
    
    result = response["result"]
    
    # Context7 returns formatted text in 'content' array
    if "content" in result and len(result["content"]) > 0:
        content = result["content"][0]
        if "text" in content:
            # Print the formatted response from Context7
            print(content["text"])
            
            # Add usage hint
            print("\n" + "="*60)
            print("Next step: Use the library ID with get_docs.py")
            print("Example: uv run get_docs.py \"/vercel/next.js\"")
        else:
            print(f"Found results but no text content", file=sys.stderr)
            print(f"Raw response: {json.dumps(result, indent=2)}")
    else:
        print(f"Unexpected response format from Context7", file=sys.stderr)
        print(f"Raw response: {json.dumps(result, indent=2)}")

def main():
    """Main entry point for library resolution."""
    # Check for help flag
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help', 'help']:
        print(__doc__)
        return
    
    # Check for library name argument
    if len(sys.argv) < 2:
        print("ERROR: Library name required\n", file=sys.stderr)
        print(__doc__)
        sys.exit(1)
    
    # Get library name (support multi-word names)
    library_name = " ".join(sys.argv[1:])
    
    print(f"Searching Context7 for '{library_name}'...")
    print()
    
    # Call Context7 API
    response = resolve_library_id(library_name)
    
    # Format and display results
    format_results(response, library_name)

if __name__ == "__main__":
    main()
