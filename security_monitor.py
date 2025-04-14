#!/usr/bin/env python3

import os
import sys
import time
import json
import logging
import argparse
from datetime import datetime
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('security_monitor.log'),
        logging.StreamHandler()
    ]
)

class SecurityMonitor:
    def __init__(self):
        self.seclists_path = Path("SecLists")
        self.fuzzing_dir = self.seclists_path / "Fuzzing"
        self.discovery_dir = self.seclists_path / "Discovery"
        self.patterns_dir = self.seclists_path / "Pattern-Matching"
        self.payloads_dir = self.seclists_path / "Payloads"
        
        # Initialize monitoring state
        self.active_monitors = {}
        self.alert_thresholds = {
            "connection_attempts": 3,
            "failed_auth": 5,
            "suspicious_patterns": 2
        }
        
        # Load pattern matchers
        self.load_patterns()
        
    def load_patterns(self):
        """Load detection patterns from SecLists"""
        self.patterns = {
            "malicious": self.load_file(self.patterns_dir / "malicious.txt"),
            "errors": self.load_file(self.patterns_dir / "errors.txt"),
            "suspicious": self.load_file(self.fuzzing_dir / "special-chars.txt")
        }
        
    def load_file(self, filepath):
        """Safely load patterns from file"""
        try:
            if filepath.exists():
                return [line.strip() for line in filepath.open().readlines() if line.strip()]
            return []
        except Exception as e:
            logging.error(f"Failed to load {filepath}: {e}")
            return []

    def start_monitoring(self, target_ip, ports=None):
        """Start monitoring specified target"""
        if not ports:
            ports = [68, 5353, 1900, 8009]  # Default ports to monitor
            
        logging.info(f"Starting monitoring of {target_ip} on ports {ports}")
        
        # Set up log directory
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        for port in ports:
            log_file = log_dir / f"port_{port}.log"
            self.active_monitors[port] = {
                "log_file": log_file,
                "last_activity": None,
                "connection_count": 0
            }
            
        # Start port monitors
        self.monitor_ports(target_ip)
        
    def monitor_ports(self, target_ip):
        """Monitor specified ports for activity"""
        try:
            while True:
                for port, monitor in self.active_monitors.items():
                    if monitor["log_file"].exists():
                        self.analyze_logs(port, target_ip)
                time.sleep(1)
        except KeyboardInterrupt:
            logging.info("Monitoring stopped by user")
            self.cleanup()

    def analyze_logs(self, port, target_ip):
        """Analyze log files for suspicious activity"""
        monitor = self.active_monitors[port]
        
        try:
            with monitor["log_file"].open() as f:
                for line in f:
                    if target_ip in line:
                        timestamp = self.extract_timestamp(line)
                        if timestamp:
                            if self.is_suspicious_activity(line, timestamp, monitor):
                                self.trigger_alert(port, line, target_ip)
        except Exception as e:
            logging.error(f"Error analyzing logs for port {port}: {e}")

    def is_suspicious_activity(self, log_line, timestamp, monitor):
        """Check if activity is suspicious based on patterns and thresholds"""
        # Check connection frequency
        if monitor["last_activity"]:
            time_diff = (timestamp - monitor["last_activity"]).total_seconds()
            if time_diff < 1:  # Less than 1 second between connections
                monitor["connection_count"] += 1
                if monitor["connection_count"] >= self.alert_thresholds["connection_attempts"]:
                    return True
            else:
                monitor["connection_count"] = 1
                
        monitor["last_activity"] = timestamp
        
        # Check for malicious patterns
        for pattern_list in self.patterns.values():
            for pattern in pattern_list:
                if pattern in log_line:
                    return True
                    
        return False

    def trigger_alert(self, port, log_line, target_ip):
        """Generate security alert"""
        alert = {
            "timestamp": datetime.now().isoformat(),
            "port": port,
            "target_ip": target_ip,
            "log_line": log_line.strip(),
            "severity": "HIGH"
        }
        
        logging.warning(f"SECURITY ALERT: Suspicious activity detected!")
        logging.warning(json.dumps(alert, indent=2))
        
        # Write alert to separate file
        with open("security_alerts.log", "a") as f:
            json.dump(alert, f)
            f.write("\n")

    def extract_timestamp(self, log_line):
        """Extract timestamp from log line"""
        try:
            timestamp_str = log_line.split("]")[0].strip("[")
            return datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
        except:
            return None

    def cleanup(self):
        """Cleanup monitoring resources"""
        logging.info("Cleaning up monitoring resources...")
        for monitor in self.active_monitors.values():
            if monitor["log_file"].exists():
                monitor["log_file"].write_text("")  # Clear log files

def main():
    parser = argparse.ArgumentParser(description="Security Monitoring Interface")
    parser.add_argument("target_ip", help="Target IP address to monitor")
    parser.add_argument("--ports", nargs="*", type=int, help="Ports to monitor")
    args = parser.parse_args()

    monitor = SecurityMonitor()
    monitor.start_monitoring(args.target_ip, args.ports)

if __name__ == "__main__":
    main() 