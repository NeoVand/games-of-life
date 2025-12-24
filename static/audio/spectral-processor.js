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
		
		// Smoothly interpolate spectrum towards target
		for (let i = 0; i < this.spectrum.length; i++) {
			this.spectrum[i] = this.spectrum[i] * this.smoothing + 
			                   this.targetSpectrum[i] * (1 - this.smoothing);
		}
		
		// Count active bins for dynamic normalization
		let activeBins = 0;
		for (let bin = 0; bin < this.numBins; bin++) {
			if (this.spectrum[bin * 4] > 0.0001) activeBins++;
		}
		// Use at least 1 to avoid division by zero, but scale by sqrt for perceptual balance
		const binNormFactor = Math.max(1, Math.sqrt(activeBins));
		
		// Generate audio samples
		for (let s = 0; s < bufferSize; s++) {
			let sumL = 0;
			let sumR = 0;
			
			for (let bin = 0; bin < this.numBins; bin++) {
				const offset = bin * 4;
				// Clamp amplitude to reasonable range (already normalized, but safety first)
				const rawAmp = this.spectrum[offset];
				const amplitude = Math.min(rawAmp, 2.0); // Hard clamp to prevent extreme values
				
				// Skip silent bins
				if (amplitude < 0.0001) continue;
				
				// Clamp pan values too
				const phase = this.spectrum[offset + 1];
				const panL = Math.min(Math.max(this.spectrum[offset + 2], 0), 2.0);
				const panR = Math.min(Math.max(this.spectrum[offset + 3], 0), 2.0);
				
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
				
				// Scale amplitude: normalize by active bins to prevent additive clipping
				// The 0.5 factor keeps overall level reasonable
				const scaledAmp = amplitude * 0.5 / binNormFactor;
				
				sumL += sample * scaledAmp * panL;
				sumR += sample * scaledAmp * panR;
			}
			
			// Apply master volume with gentler scaling and soft clip
			const volumeScale = this.masterVolume * 0.8;
			left[s] = Math.tanh(sumL * volumeScale);
			right[s] = Math.tanh(sumR * volumeScale);
		}
		
		return true;
	}
}

registerProcessor('spectral-processor', SpectralProcessor);

