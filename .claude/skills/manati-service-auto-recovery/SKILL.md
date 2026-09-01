---
name: manati-service-auto-recovery
description: |
  Automated health check and service recovery for Manati endpoints.
  
  Checks the health of three critical endpoints: Team MCP OAuth server, 
  Team MCP protected resource metadata, and Portal API middleware. If ANY 
  check fails, automatically restarts mcp-team, caddy, and redis-server on 
  the odoo-mcp box via Tailscale SSH, then re-verifies all endpoints.
  
  Use this skill whenever you suspect Manati services are down, need to probe 
  endpoint health, want automated recovery, or are setting up monitoring. 
  Triggers: "check manati services", "is manati down", "restart manati services", 
  "manati auto-recovery", "service health", "recover manati", or any incident 
  where endpoints are unreachable.
---

# Manati Service Auto-Recovery

## Overview

This skill performs a full automated health + recovery cycle for Manati's critical infrastructure in one step:

1. **Health Check** (all three endpoints)
2. **Auto-Recovery** (if any fails, restart services via SSH)
3. **Verification** (re-check endpoints after restart)
4. **Reporting** (clear status summary with next steps if needed)

## Health Check Endpoints

The skill monitors three endpoints:

**Team MCP OAuth Metadata:**
- URL: `https://mcp.manati.co.za/.well-known/oauth-authorization-server`
- Healthy if: Response is valid JSON containing `"issuer":"https://mcp.manati.co.za/"`
- Unhealthy if: Timeout, TLS error, non-JSON response, or missing issuer field

**Team MCP Protected Resource:**
- URL: `https://mcp.manati.co.za/.well-known/oauth-protected-resource/mcp`
- Healthy if: Response is valid JSON containing `"resource":"https://mcp.manati.co.za/mcp"`
- Unhealthy if: Timeout, TLS error, non-JSON response, or missing resource field

**Portal API Middleware:**
- URL: `https://api.manati.co.za/`
- Healthy if: Responds over HTTPS (any response is fine; 404 is acceptable)
- Unhealthy if: Timeout, TLS error, connection refused

## Automatic Recovery

If any endpoint check fails, the skill will:

1. SSH to the odoo-mcp box at `100.113.36.89` (via Tailscale keyless auth)
2. Execute: `sudo systemctl restart mcp-team caddy redis-server`
3. Wait 5 seconds for services to stabilize
4. Re-run all three health checks to verify recovery
5. Report the before/after state

**Context:**
- Team MCP service runs as `mcp-team` systemd unit (loopback 127.0.0.1:8770)
- Caddy handles HTTPS termination and reverse proxy
- Redis stores OAuth tokens and sessions
- All run on the manati-odoo-mcp box (Ubuntu, Tailscale-enabled)

## Output Format

### Scenario 1: All endpoints healthy (first check)

```
All Manati endpoints healthy.

1. Team MCP OAuth metadata: OK
2. Team MCP protected-resource metadata: OK
3. Portal middleware: OK
```

### Scenario 2: Recovery successful

```
Services recovered successfully.

Initial state:
1. Team MCP OAuth metadata: PROBLEM — Operation aborted (timeout)
2. Team MCP protected-resource metadata: OK
3. Portal middleware: PROBLEM — Network error

After restart:
1. Team MCP OAuth metadata: OK
2. Team MCP protected-resource metadata: OK
3. Portal middleware: OK
```

### Scenario 3: Recovery incomplete or SSH failed

```
ATTENTION: Service recovery incomplete or unavailable.

Endpoint status (post-restart attempt):
1. Team MCP OAuth metadata: OK
2. Team MCP protected-resource metadata: PROBLEM — [error]
3. Portal middleware: OK

Action required:
- If SSH failed ("Network is unreachable"): Tailscale is down. Use Xneelo 
  break-glass console (cloud.xneelo.com > Compute > Instances > Console tab).
- If services still failing: Check box logs, consider full reboot, or escalate 
  to infrastructure team.

Recovery context:
- Box: manati-odoo-mcp at 100.113.36.89 (Tailscale only, no public SSH)
- Services: mcp-team, caddy, redis-server
- To check manually: ssh ubuntu@100.113.36.89 "sudo systemctl status mcp-team caddy redis-server"
```

## Limitations & Fallback Plans

**Tailscale connectivity down:**
- SSH will fail with "Network is unreachable" or similar
- Skill will provide break-glass console instructions
- Manual fix: Cloud.xneelo.com > Instances > Console > ubuntu login > `sudo systemctl restart mcp-team caddy redis-server`

**Services still down after restart:**
- May indicate deeper issues (disk full, corrupted config, hardware problem)
- Check: `sudo journalctl -u mcp-team -n 50` (last 50 log lines)
- Consider: `sudo reboot` for a full restart
- Escalate if problem persists

**High-frequency failures:**
- If the skill recovers services frequently, underlying cause needs investigation
- Log patterns in `sudo journalctl -u mcp-team`
- Check Redis disk usage, Caddy config syntax, MCP process memory
- May indicate insufficient resources or config drift

## Integration with Monitoring

This skill can be run:
- **Manually**: Type "check manati services" or invoke directly
- **Scheduled**: Use `/schedule` to run hourly, daily, or on a custom interval
- **Via CI/CD**: Call from a health-check pipeline or incident-response automation

Example scheduled task:
```
schedule: hourly
task: Check Manati services and auto-recover if needed
skill: manati-service-auto-recovery
```

## Scripts

The skill uses `scripts/recovery.py` (bundled) to orchestrate the full workflow:
- Health checks (web_fetch)
- Service restart (SSH via Tailscale)
- Verification
- Reporting

You don't need to run the script directly; the skill loads and uses it automatically.
