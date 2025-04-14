#!/usr/bin/env python3

import os
import sys
import time
import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

from security_monitor import SecurityMonitor
from pattern_matcher import PatternMatcher
from network_monitor import NetworkMonitor

class SecurityInterface:
    def __init__(self):
        self.setup_logging()
        self.load_components()
        self.initialize_state()

    def setup_logging(self):
        """Configure logging for the security interface"""
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('logs/security_interface.log'),
                logging.StreamHandler()
            ]
        )

    def load_components(self):
        """Load and initialize security components"""
        self.pattern_matcher = PatternMatcher()
        logging.info("Loaded pattern matching engine")
        
        # Initialize state tracking
        self.active_monitors: Dict[str, Dict] = {}
        self.alerts: List[Dict] = []
        self.threat_levels: Dict[str, int] = {
            "LOW": 0,
            "MEDIUM": 0,
            "HIGH": 0
        }

    def initialize_state(self):
        """Initialize monitoring state and counters"""
        self.state = {
            "start_time": datetime.now(),
            "total_connections": 0,
            "blocked_ips": set(),
            "suspicious_ips": set(),
            "active_monitors": {}
        }

    def start_monitoring(self, target_ip: str, ports: Optional[List[int]] = None):
        """Start comprehensive security monitoring"""
        logging.info(f"Starting comprehensive security monitoring for {target_ip}")
        
        try:
            # Initialize network monitor
            network_mon = NetworkMonitor(target_ip, ports)
            self.active_monitors["network"] = network_mon
            
            # Initialize security monitor
            security_mon = SecurityMonitor()
            self.active_monitors["security"] = security_mon
            
            # Start monitoring processes
            self.start_monitors(target_ip)
            
            # Begin main monitoring loop
            self.monitor_loop()
            
        except KeyboardInterrupt:
            logging.info("Monitoring stopped by user")
            self.cleanup()
        except Exception as e:
            logging.error(f"Error in monitoring: {e}")
            self.cleanup()

    def start_monitors(self, target_ip: str):
        """Start all monitoring components"""
        for name, monitor in self.active_monitors.items():
            try:
                if name == "network":
                    monitor.start_monitoring()
                elif name == "security":
                    monitor.start_monitoring(target_ip)
                
                logging.info(f"Started {name} monitor")
                
            except Exception as e:
                logging.error(f"Failed to start {name} monitor: {e}")

    def monitor_loop(self):
        """Main monitoring loop"""
        while True:
            try:
                self.check_alerts()
                self.analyze_patterns()
                self.update_status()
                time.sleep(1)
                
            except Exception as e:
                logging.error(f"Error in monitoring loop: {e}")

    def check_alerts(self):
        """Check for new security alerts"""
        alert_file = Path("security_alerts.log")
        if not alert_file.exists():
            return
            
        try:
            with alert_file.open() as f:
                for line in f:
                    alert = json.loads(line)
                    self.process_alert(alert)
                    
        except Exception as e:
            logging.error(f"Error processing alerts: {e}")

    def process_alert(self, alert: Dict):
        """Process and categorize security alerts"""
        if alert.get("risk_level"):
            self.threat_levels[alert["risk_level"]] += 1
            
        if alert.get("target_ip"):
            if alert.get("risk_level") == "HIGH":
                self.state["blocked_ips"].add(alert["target_ip"])
            else:
                self.state["suspicious_ips"].add(alert["target_ip"])
                
        self.alerts.append(alert)
        
        # Trigger responses based on alert type
        if alert.get("risk_level") == "HIGH":
            self.handle_high_risk_alert(alert)

    def handle_high_risk_alert(self, alert: Dict):
        """Handle high risk security alerts"""
        logging.critical("HIGH RISK SECURITY ALERT DETECTED!")
        logging.critical(json.dumps(alert, indent=2))
        
        # Implement immediate response actions
        response = {
            "timestamp": datetime.now().isoformat(),
            "alert": alert,
            "actions": [
                "Logged critical alert",
                "Added IP to block list",
                "Increased monitoring sensitivity"
            ]
        }
        
        with open("response_actions.log", "a") as f:
            json.dump(response, f)
            f.write("\n")

    def analyze_patterns(self):
        """Analyze traffic patterns for threats"""
        for name, monitor in self.active_monitors.items():
            if name == "network":
                monitor_logs = Path("logs").glob("port_*.log")
                for log_file in monitor_logs:
                    results = self.pattern_matcher.scan_file(str(log_file))
                    for result in results:
                        if result["suspicious"]:
                            self.handle_suspicious_pattern(result)

    def handle_suspicious_pattern(self, pattern_match: Dict):
        """Handle detected suspicious patterns"""
        logging.warning("Suspicious pattern detected!")
        logging.warning(json.dumps(pattern_match, indent=2))
        
        # Record pattern match
        with open("pattern_matches.log", "a") as f:
            json.dump(pattern_match, f)
            f.write("\n")

    def update_status(self):
        """Update monitoring status"""
        status = {
            "timestamp": datetime.now().isoformat(),
            "uptime": str(datetime.now() - self.state["start_time"]),
            "blocked_ips": len(self.state["blocked_ips"]),
            "suspicious_ips": len(self.state["suspicious_ips"]),
            "threat_levels": self.threat_levels,
            "active_monitors": list(self.active_monitors.keys())
        }
        
        # Write status to file
        with open("monitor_status.json", "w") as f:
            json.dump(status, f, indent=2)

    def cleanup(self):
        """Clean up monitoring resources"""
        logging.info("Cleaning up monitoring resources...")
        
        for name, monitor in self.active_monitors.items():
            try:
                monitor.cleanup()
                logging.info(f"Cleaned up {name} monitor")
            except Exception as e:
                logging.error(f"Error cleaning up {name} monitor: {e}")

def main():
    parser = argparse.ArgumentParser(description="Security Monitoring Interface")
    parser.add_argument("target_ip", help="Target IP address to monitor")
    parser.add_argument("--ports", nargs="*", type=int, help="Ports to monitor")
    args = parser.parse_args()
    
    interface = SecurityInterface()
    interface.start_monitoring(args.target_ip, args.ports)

if __name__ == "__main__":
    main() 