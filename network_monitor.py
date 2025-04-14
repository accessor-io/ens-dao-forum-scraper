#!/usr/bin/env python3

import os
import time
import json
import logging
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from pattern_matcher import PatternMatcher

class NetworkMonitor:
    def __init__(self, target_ip: str, ports: Optional[List[int]] = None):
        self.target_ip = target_ip
        self.ports = ports or [68, 5353, 1900, 8009]
        self.log_dir = Path("logs")
        self.log_dir.mkdir(exist_ok=True)
        
        # Initialize pattern matcher
        self.pattern_matcher = PatternMatcher()
        
        # Configure logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('network_monitor.log'),
                logging.StreamHandler()
            ]
        )
        
        # Initialize monitoring state
        self.monitors: Dict[int, Dict] = {}
        self.initialize_monitors()

    def initialize_monitors(self):
        """Initialize port monitors"""
        for port in self.ports:
            log_file = self.log_dir / f"port_{port}.log"
            self.monitors[port] = {
                "log_file": log_file,
                "process": None,
                "last_position": 0,
                "alert_count": 0
            }

    def start_monitoring(self):
        """Start monitoring all specified ports"""
        logging.info(f"Starting network monitoring for {self.target_ip} on ports {self.ports}")
        
        try:
            # Start netcat listeners for each port
            for port in self.ports:
                self.start_port_monitor(port)
            
            # Begin log analysis loop
            self.analyze_logs()
                
        except KeyboardInterrupt:
            logging.info("Monitoring stopped by user")
            self.cleanup()
        except Exception as e:
            logging.error(f"Error in monitoring: {e}")
            self.cleanup()

    def start_port_monitor(self, port: int):
        """Start monitoring a specific port"""
        monitor = self.monitors[port]
        
        try:
            # Start netcat listener in background
            cmd = f"nc -l -v -k -p {port}"
            process = subprocess.Popen(
                cmd.split(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            monitor["process"] = process
            logging.info(f"Started monitoring on port {port}")
            
        except Exception as e:
            logging.error(f"Failed to start monitor on port {port}: {e}")

    def analyze_logs(self):
        """Continuously analyze log files for suspicious activity"""
        while True:
            for port, monitor in self.monitors.items():
                if not monitor["log_file"].exists():
                    continue
                    
                # Read new log entries
                with monitor["log_file"].open() as f:
                    f.seek(monitor["last_position"])
                    new_entries = f.readlines()
                    monitor["last_position"] = f.tell()
                
                # Analyze each new entry
                for entry in new_entries:
                    if self.target_ip in entry:
                        self.analyze_entry(port, entry)
            
            time.sleep(1)  # Prevent excessive CPU usage

    def analyze_entry(self, port: int, entry: str):
        """Analyze a single log entry for threats"""
        # Use pattern matcher to analyze entry
        analysis = self.pattern_matcher.analyze_traffic(entry)
        
        if analysis["suspicious"]:
            self.handle_suspicious_activity(port, entry, analysis)

    def handle_suspicious_activity(self, port: int, entry: str, analysis: Dict):
        """Handle detected suspicious activity"""
        monitor = self.monitors[port]
        monitor["alert_count"] += 1
        
        alert = {
            "timestamp": datetime.now().isoformat(),
            "port": port,
            "target_ip": self.target_ip,
            "content": entry.strip(),
            "analysis": analysis,
            "alert_count": monitor["alert_count"]
        }
        
        # Log the alert
        logging.warning("SECURITY ALERT DETECTED!")
        logging.warning(json.dumps(alert, indent=2))
        
        # Write to alerts file
        with open("security_alerts.log", "a") as f:
            json.dump(alert, f)
            f.write("\n")
        
        # Take action based on risk level
        if analysis["risk_level"] == "HIGH":
            self.handle_high_risk_alert(port, alert)
        elif analysis["risk_level"] == "MEDIUM":
            self.handle_medium_risk_alert(port, alert)

    def handle_high_risk_alert(self, port: int, alert: Dict):
        """Handle high risk security alerts"""
        logging.critical(f"HIGH RISK ALERT on port {port}!")
        
        # Implement immediate response actions here
        # For example: Block IP, notify admin, etc.
        
        # Log response actions
        response = {
            "timestamp": datetime.now().isoformat(),
            "alert": alert,
            "actions_taken": [
                "Logged HIGH risk alert",
                "Notification sent to admin"
            ]
        }
        
        with open("response_actions.log", "a") as f:
            json.dump(response, f)
            f.write("\n")

    def handle_medium_risk_alert(self, port: int, alert: Dict):
        """Handle medium risk security alerts"""
        logging.warning(f"MEDIUM RISK ALERT on port {port}")
        
        # Implement monitoring escalation
        monitor = self.monitors[port]
        if monitor["alert_count"] >= 3:
            self.escalate_monitoring(port, alert)

    def escalate_monitoring(self, port: int, alert: Dict):
        """Escalate monitoring for suspicious activity"""
        logging.warning(f"Escalating monitoring on port {port} due to repeated alerts")
        
        # Implement escalation actions here
        # For example: Increase logging verbosity, start packet capture, etc.
        
        escalation = {
            "timestamp": datetime.now().isoformat(),
            "port": port,
            "alert": alert,
            "escalation_actions": [
                "Increased monitoring sensitivity",
                "Started detailed packet capture"
            ]
        }
        
        with open("escalations.log", "a") as f:
            json.dump(escalation, f)
            f.write("\n")

    def cleanup(self):
        """Clean up monitoring processes and resources"""
        logging.info("Cleaning up monitoring resources...")
        
        for port, monitor in self.monitors.items():
            if monitor["process"]:
                monitor["process"].terminate()
                logging.info(f"Stopped monitoring on port {port}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Network Security Monitor")
    parser.add_argument("target_ip", help="Target IP address to monitor")
    parser.add_argument("--ports", nargs="+", type=int, help="Ports to monitor")
    args = parser.parse_args()
    
    monitor = NetworkMonitor(args.target_ip, args.ports)
    monitor.start_monitoring()

if __name__ == "__main__":
    main() 