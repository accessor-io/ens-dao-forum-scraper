#!/usr/bin/env python3

import re
import json
from pathlib import Path
from typing import List, Dict, Set, Optional

class PatternMatcher:
    def __init__(self, seclists_path: str = "SecLists"):
        self.seclists_path = Path(seclists_path)
        self.patterns: Dict[str, Set[str]] = {
            "malicious": set(),
            "web_attacks": set(),
            "suspicious_paths": set(),
            "known_exploits": set()
        }
        self.load_patterns()

    def load_patterns(self):
        """Load detection patterns from SecLists directories"""
        # Load malicious patterns
        malicious_file = self.seclists_path / "Pattern-Matching/malicious.txt"
        if malicious_file.exists():
            self.patterns["malicious"].update(self._load_file(malicious_file))

        # Load web attack patterns
        web_attacks = self.seclists_path / "Discovery/Web-Content/common.txt"
        if web_attacks.exists():
            self.patterns["web_attacks"].update(self._load_file(web_attacks))

        # Load suspicious paths
        paths_file = self.seclists_path / "Discovery/Web-Content/directory-list-2.3-small.txt"
        if paths_file.exists():
            self.patterns["suspicious_paths"].update(self._load_file(paths_file))

        # Load known exploit patterns
        exploits_file = self.seclists_path / "Pattern-Matching/errors.txt"
        if exploits_file.exists():
            self.patterns["known_exploits"].update(self._load_file(exploits_file))

    def _load_file(self, filepath: Path) -> Set[str]:
        """Load and clean patterns from file"""
        try:
            with filepath.open() as f:
                return {line.strip() for line in f if line.strip() and not line.startswith('#')}
        except Exception as e:
            print(f"Error loading {filepath}: {e}")
            return set()

    def match_patterns(self, text: str, pattern_types: Optional[List[str]] = None) -> Dict[str, List[str]]:
        """Match text against loaded patterns"""
        matches = {}
        
        if pattern_types is None:
            pattern_types = list(self.patterns.keys())
            
        for pattern_type in pattern_types:
            if pattern_type not in self.patterns:
                continue
                
            matches[pattern_type] = []
            for pattern in self.patterns[pattern_type]:
                if pattern in text:
                    matches[pattern_type].append(pattern)
                    
        return matches

    def analyze_traffic(self, log_entry: str) -> Dict[str, any]:
        """Analyze network traffic log entry for suspicious patterns"""
        results = {
            "suspicious": False,
            "matches": {},
            "risk_level": "LOW",
            "recommendations": []
        }
        
        # Match against all pattern types
        matches = self.match_patterns(log_entry)
        if any(matches.values()):
            results["suspicious"] = True
            results["matches"] = matches
            
            # Determine risk level
            if matches.get("malicious") or matches.get("known_exploits"):
                results["risk_level"] = "HIGH"
                results["recommendations"].append("Block source IP immediately")
            elif matches.get("web_attacks"):
                results["risk_level"] = "MEDIUM"
                results["recommendations"].append("Investigate source IP behavior")
            elif matches.get("suspicious_paths"):
                results["risk_level"] = "LOW"
                results["recommendations"].append("Monitor source IP for escalation")
                
        return results

    def scan_file(self, filepath: str) -> List[Dict[str, any]]:
        """Scan file for suspicious patterns"""
        results = []
        try:
            with open(filepath) as f:
                for i, line in enumerate(f, 1):
                    analysis = self.analyze_traffic(line)
                    if analysis["suspicious"]:
                        analysis["line_number"] = i
                        analysis["content"] = line.strip()
                        results.append(analysis)
        except Exception as e:
            print(f"Error scanning file {filepath}: {e}")
            
        return results

def main():
    # Example usage
    matcher = PatternMatcher()
    
    # Analyze a sample log entry
    sample_log = "[2024-01-10 12:34:56] Attempted directory traversal: ../../../etc/passwd from IP 10.1.10.20"
    results = matcher.analyze_traffic(sample_log)
    
    print("Analysis Results:")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main() 