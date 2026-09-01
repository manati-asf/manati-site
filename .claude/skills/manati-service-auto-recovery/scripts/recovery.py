#!/usr/bin/env python3
"""
Manati Service Auto-Recovery Script

Orchestrates health checks, automatic service restarts, and verification for
Manati endpoints. Used by the manati-service-auto-recovery skill.
"""

import json
import subprocess
import time
from typing import Dict, Tuple, List

# Endpoints to check
ENDPOINTS = {
    "oauth-auth": {
        "url": "https://mcp.manati.co.za/.well-known/oauth-authorization-server",
        "check_field": "issuer",
        "check_value": "https://mcp.manati.co.za/",
    },
    "oauth-resource": {
        "url": "https://mcp.manati.co.za/.well-known/oauth-protected-resource/mcp",
        "check_field": "resource",
        "check_value": "https://mcp.manati.co.za/mcp",
    },
    "api-middleware": {
        "url": "https://api.manati.co.za/",
        "check_field": None,  # Just check if it responds
    },
}

BOX_IP = "100.113.36.89"
BOX_USER = "ubuntu"
SERVICES = ["mcp-team", "caddy", "redis-server"]


def fetch_url(url: str) -> Tuple[bool, str]:
    """
    Fetch a URL and return (is_healthy, detail).
    Uses curl for simplicity in subprocess.
    """
    try:
        result = subprocess.run(
            ["curl", "-s", "-m", "5", "-w", "%{http_code}", url],
            capture_output=True,
            timeout=10,
        )

        http_code = result.stdout.decode().strip()[-3:]
        body = result.stdout.decode().strip()[:-3] if len(result.stdout.decode()) > 3 else ""

        if http_code.startswith("5"):
            return False, f"HTTP {http_code}"

        if http_code.startswith("4") and http_code != "404":
            return False, f"HTTP {http_code}"

        # 2xx, 3xx, or 404 is acceptable for api-middleware
        return True, "OK"

    except subprocess.TimeoutExpired:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)


def check_endpoint(name: str, config: Dict) -> Tuple[bool, str]:
    """
    Check a single endpoint.
    Returns (is_healthy, status_message).
    """
    url = config["url"]

    try:
        # Fetch with timeout
        result = subprocess.run(
            ["curl", "-s", "-m", "5", url],
            capture_output=True,
            timeout=10,
        )

        if result.returncode != 0:
            return False, "Network error (timeout or TLS issue)"

        body = result.stdout.decode().strip()

        # If no check_field, just need a response
        if config["check_field"] is None:
            return True, "OK"

        # Parse JSON and check for expected field
        try:
            data = json.loads(body)
            if config["check_field"] in data:
                value = data[config["check_field"]]
                if value == config["check_value"]:
                    return True, "OK"
                else:
                    return False, f"Field mismatch (got {value})"
            else:
                return False, f"Missing '{config['check_field']}' field"
        except json.JSONDecodeError:
            return False, "Invalid JSON response"

    except subprocess.TimeoutExpired:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)


def run_health_check() -> Dict[str, Tuple[bool, str]]:
    """
    Run health checks on all endpoints.
    Returns dict: {endpoint_name: (is_healthy, status_msg)}
    """
    results = {}
    for name, config in ENDPOINTS.items():
        healthy, msg = check_endpoint(name, config)
        results[name] = (healthy, msg)
    return results


def ssh_restart_services() -> Tuple[bool, str]:
    """
    SSH to odoo-mcp box and restart services.
    Returns (success, detail_msg).
    """
    try:
        cmd = f"ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 {BOX_USER}@{BOX_IP} 'sudo systemctl restart {' '.join(SERVICES)} && echo OK'"

        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            timeout=30,
        )

        output = result.stdout.decode().strip()

        if result.returncode == 0 and "OK" in output:
            # Wait for services to stabilize
            time.sleep(5)
            return True, "Services restarted"
        else:
            stderr = result.stderr.decode().strip()
            if "Network is unreachable" in stderr:
                return False, "SSH failed: Network is unreachable (Tailscale down?)"
            else:
                return False, f"SSH command failed: {stderr}"

    except subprocess.TimeoutExpired:
        return False, "SSH timeout"
    except Exception as e:
        return False, f"SSH error: {str(e)}"


def format_status(before: Dict, after: Dict) -> str:
    """
    Format before/after health check results for display.
    """
    output = []

    # Map endpoint keys to display names
    display_names = {
        "oauth-auth": "Team MCP OAuth metadata",
        "oauth-resource": "Team MCP protected-resource metadata",
        "api-middleware": "Portal middleware",
    }

    all_healthy_after = all(healthy for healthy, _ in after.values())

    # Nothing was wrong to begin with.
    if before == after and all_healthy_after:
        output.append("All Manati endpoints healthy.")
        output.append("")
        for key, (healthy, msg) in before.items():
            status = "OK" if healthy else "PROBLEM"
            output.append(f"{display_names[key]}: {status}")
        return "\n".join(output)

    # Branch on the state AFTER the restart, not on whether anything changed.
    # A partial recovery changes the state but is still a failure, and must not
    # be reported as success.
    if all_healthy_after:
        output.append("Services recovered successfully.")
    else:
        output.append("ATTENTION: Service recovery incomplete or unavailable.")

    output.append("")
    output.append("Initial state:")
    for key, (healthy, msg) in before.items():
        status = "OK" if healthy else f"PROBLEM ({msg})"
        output.append(f"  {display_names[key]}: {status}")

    output.append("")
    output.append("After restart:")
    for key, (healthy, msg) in after.items():
        status = "OK" if healthy else f"PROBLEM ({msg})"
        output.append(f"  {display_names[key]}: {status}")

    return "\n".join(output)


def main():
    """
    Main orchestration: check -> recover if needed -> verify.
    """
    print("=" * 60)
    print("Manati Service Auto-Recovery")
    print("=" * 60)
    print()

    # Step 1: Initial health check
    print("Step 1: Checking endpoint health...")
    before = run_health_check()

    # Step 2: Check if recovery is needed
    needs_recovery = any(not healthy for healthy, _ in before.values())

    if not needs_recovery:
        print("All endpoints healthy. No recovery needed.")
        print()
        print(format_status(before, before))
        return

    print("Issues detected. Initiating recovery...")
    print()

    # Step 3: Attempt recovery
    success, msg = ssh_restart_services()
    if not success:
        print(f"Recovery attempt failed: {msg}")
        print()
        print("ATTENTION: Service recovery unavailable.")
        print(f"Detail: {msg}")
        print()
        print("If SSH failed due to Tailscale, use Xneelo break-glass console:")
        print("  1. cloud.xneelo.com > Compute > Instances")
        print("  2. Click box > Console tab")
        print("  3. Log in as 'ubuntu'")
        print(f"  4. sudo systemctl restart {' '.join(SERVICES)}")
        return

    # Step 4: Verify recovery
    print("Waiting for services to stabilize...")
    print("Step 2: Verifying endpoint health...")
    after = run_health_check()

    print()
    print(format_status(before, after))

    # Step 5: Report final status
    all_healthy_after = all(healthy for healthy, _ in after.values())
    if all_healthy_after:
        print()
        print("Recovery successful. All endpoints operational.")
    else:
        print()
        print("Some endpoints remain unhealthy after restart.")
        print("Further investigation required.")


if __name__ == "__main__":
    main()
