/**
 * Spectral Synthesis AudioWorklet Processor
 * 
 * Converts frequency-domain spectrum data (from GPU) to time-domain audio.
 * Uses additive synthesis: sums sine waves for each active frequency bin.
 * 
 * This file runs in the AudioWorkletGlobalScope and must be standalone JavaScript.
 */

class SpectralProcessor extends AudioWorkletProcessor {
	constructor(options) {
		super();
		
		/** @type {number} */
		this.numBins = options.processorOptions?.numBins ?? 256;
		
		/** @type {number} */
		this.minFreq = options.processorOptions?.minFreq ?? 80;
		
		/** @type {number} */
		this.maxFreq = options.processorOptions?.maxFreq ?? 2000;
		
		/** @type {Float32Array} - Current spectrum: [amp, phase, panL, panR] × numBins */
		this.spectrum = new Float32Array(this.numBins * 4);
		
		/** @type {Float32Array} - Target spectrum for smooth interpolation */
		this.targetSpectrum = new Float32Array(this.numBins * 4);
		
		/** @type {Float32Array} - Phase accumulators for each oscillator */
		this.phases = new Float32Array(this.numBins);
		
		/** @type {number} - Smoothing factor (higher = slower transitions) */
		this.smoothing = 0.85;
		
		/** @type {number} - Master volume */
		this.masterVolume = 0.5;
		
		/** @type {boolean} - Whether audio is enabled */
		this.enabled = true;
		
		/** @type {number} - Softening amount for low-pass filtering */
		this.softening = 0.5;
		
		/** @type {number} - Frame counter since last spectrum update */
		this.framesSinceUpdate = 0;
		
		/** @type {number} - Max frames before auto-fade (prevents stuck audio) */
		this.maxFramesWithoutUpdate = 30; // ~0.1 seconds
		
		// Pre-calculate frequencies for each bin (logarithmic spacing)
		/** @type {Float32Array} */
		this.frequencies = new Float32Array(this.numBins);
		this.calculateFrequencies();
		
		// Handle messages from main thread
		this.port.onmessage = (event) => this.handleMessage(event.data);
	}
	
	/**
	 * Calculate frequency for each bin using logarithmic spacing.
	 */
	calculateFrequencies() {
		const logMin = Math.log(this.minFreq);
		const logMax = Math.log(this.maxFreq);
		const logRange = logMax - logMin;
		
		for (let i = 0; i < this.numBins; i++) {
			const t = i / (this.numBins - 1);
			this.frequencies[i] = Math.exp(logMin + t * logRange);
		}
	}
	
	/**
	 * Handle messages from the main thread.
	 * @param {object} data
	 */
	handleMessage(data) {
		if (data.spectrum instanceof Float32Array) {
			// Received new spectrum data from GPU
			this.targetSpectrum.set(data.spectrum);
			// Reset frame counter - we got fresh data
			this.framesSinceUpdate = 0;
		}
		
		if (typeof data.enabled === 'boolean') {
			this.enabled = data.enabled;
		}
		
		if (typeof data.volume === 'number') {
			this.masterVolume = Math.max(0, Math.min(1, data.volume));
		}
		
		if (typeof data.softening === 'number') {
			this.softening = Math.max(0, Math.min(1, data.softening));
			// Map softening to smoothing factor
			this.smoothing = 0.7 + this.softening * 0.25; // 0.7 to 0.95
		}
		
		if (typeof data.minFreq === 'number' || typeof data.maxFreq === 'number') {
			if (typeof data.minFreq === 'number') this.minFreq = data.minFreq;
			if (typeof data.maxFreq === 'number') this.maxFreq = data.maxFreq;
			this.calculateFrequencies();
		}
	}
	
	/**
	 * Process audio - called 44100/128 ≈ 344 times per second.
	 * @param {Float32Array[][]} inputs - Input audio (unused)
	 * @param {Float32Array[][]} outputs - Output audio buffers
	 * @param {Record<string, Float32Array>} parameters - AudioParams
	 * @returns {boolean} - Keep processor alive
	 */
	process(inputs, outputs, parameters) {
		const output = outputs[0];
		if (!output || output.length < 2 || !this.enabled) {
			// Silence when disabled
			return true;
		}
		
		const left = output[0];
		const right = output[1];
		const bufferSize = left.length;
		
		// Increment frame counter (used to detect stale data)
		this.framesSinceUpdate++;
		
		// If no new data for too long, fade out to prevent stuck audio
		if (this.framesSinceUpdate > this.maxFramesWithoutUpdate) {
			// Fade target spectrum to zero
			for (let i = 0; i < this.targetSpectrum.length; i++) {
				this.targetSpectrum[i] *= 0.95;
			}
		}
		
		// Smoothly interpolate spectrum towards target
		for (let i = 0; i < this.spectrum.length; i++) {
			this.spectrum[i] = this.spectrum[i] * this.smoothing + 
			                   this.targetSpectrum[i] * (1 - this.smoothing);
		}
		
		// Count active bins and sum total amplitude for dynamic normalization
		let activeBins = 0;
		let totalAmp = 0;
		for (let bin = 0; bin < this.numBins; bin++) {
			const amp = this.spectrum[bin * 4];
			if (amp > 0.0001) {
				activeBins++;
				totalAmp += amp;
			}
		}
		
		// Dynamic normalization: scale by total energy to keep consistent volume
		// Use log scale for more natural loudness perception
		// Add 1 to avoid log(0), clamp minimum to prevent silence
		const targetLevel = 0.3; // Target RMS level
		const currentEnergy = Math.max(0.001, totalAmp);
		// Smooth the normalization to avoid sudden volume changes
		const desiredNorm = targetLevel / Math.sqrt(currentEnergy);
		const binNormFactor = Math.max(0.1, Math.min(10, desiredNorm)); // Clamp to reasonable range
		
		// Generate audio samples
		for (let s = 0; s < bufferSize; s++) {
			let sumL = 0;
			let sumR = 0;
			
			for (let bin = 0; bin < this.numBins; bin++) {
				const offset = bin * 4;
				// Get raw amplitude (already quite small from shader)
				const rawAmp = this.spectrum[offset];
				
				// Skip silent bins early
				if (rawAmp < 0.0001) continue;
				
				// Clamp amplitude to reasonable range
				const amplitude = Math.min(rawAmp, 1.0);
				
				// Get phase and pan values with clamping
				const phase = this.spectrum[offset + 1];
				const panL = Math.min(Math.max(this.spectrum[offset + 2], 0), 1.0);
				const panR = Math.min(Math.max(this.spectrum[offset + 3], 0), 1.0);
				
				// Get frequency for this bin
				const freq = this.frequencies[bin];
				
				// Update phase accumulator
				// sampleRate is a global in AudioWorkletGlobalScope
				this.phases[bin] += freq / sampleRate;
				if (this.phases[bin] > 1) {
					this.phases[bin] -= 1;
				}
				
				// Generate sine sample with phase offset
				const theta = (this.phases[bin] + phase / 6.28318) * Math.PI * 2;
				const sample = Math.sin(theta);
				
				// Scale amplitude: heavy normalization to prevent clipping
				const scaledAmp = amplitude / binNormFactor;
				
				sumL += sample * scaledAmp * panL;
				sumR += sample * scaledAmp * panR;
			}
			
			// Apply master volume with soft clipping (tanh provides smooth saturation)
			// The dynamic normalization keeps levels consistent, so just apply master volume
			left[s] = Math.tanh(sumL * this.masterVolume * 3.0);
			right[s] = Math.tanh(sumR * this.masterVolume * 3.0);
		}
		
		return true;
	}
}

registerProcessor('spectral-processor', SpectralProcessor);

