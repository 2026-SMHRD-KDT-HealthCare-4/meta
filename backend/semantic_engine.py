import math
import numpy as np

class SemanticEngine:
    def __init__(self, temperature=1.0):
        self.temperature = temperature
        self.k = 1.0  # Boltzmann constant simplified

    def calculate_energy(self, logprobs):
        """
        Calculates Semantic Energy based on token logprobs.
        logprobs: List of log probabilities for tokens.
        """
        if not logprobs:
            return 0.0
        
        # E = -log(P) is the basic definition of information energy/entropy
        # The paper suggests Boltzmann energy based on logits.
        # Since logprobs = log(softmax(logits)), we can approximate energy.
        
        energies = [-lp for lp in logprobs]
        # Boltmann sum: Sum(exp(-E / (k*T))) / Z
        # Here we just want a relative "Energy" score.
        # High energy = low probability/high uncertainty.
        
        total_energy = sum(energies) / len(energies)
        return total_energy

    def get_metacognitive_uncertainty(self, text, logprobs):
        """
        Main entry point to get uncertainty score.
        """
        energy = self.calculate_energy(logprobs)
        # Normalize to 0-1 range (heuristic)
        normalized_uncertainty = 1.0 - math.exp(-energy)
        return normalized_uncertainty
