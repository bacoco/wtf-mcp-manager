/**
 * Auto Detector
 * Automatically detects which MCPs are needed for a project
 */

import fs from 'fs/promises';
import path from 'path';
import { MCPRegistry } from './registry.js';

export class AutoDetector {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.registry = new MCPRegistry();
  }

  async scan() {
    const detected = [];
    const allMCPs = this.registry.getAll();
    
    for (const [id, info] of Object.entries(allMCPs)) {
      if (info.autoDetect) {
        for (const pattern of info.autoDetect) {
          const fullPath = path.join(this.projectRoot, pattern);
          
          try {
            await fs.access(fullPath);
            detected.push({
              id,
              name: info.name,
              reason: `Found ${pattern}`,
              confidence: 'high'
            });
            break; // Found one pattern, no need to check others
          } catch {
            // File/directory doesn't exist, continue checking
          }
        }
      }
    }
    
    // Additional smart detections
    
    // Check package.json for hints
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf-8')
      );
      
      // Check dependencies
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      // Supabase detection
      if (deps['@supabase/supabase-js'] && !detected.find(d => d.id === 'supabase')) {
        detected.push({
          id: 'supabase',
          name: 'Supabase',
          reason: 'Found @supabase/supabase-js in package.json',
          confidence: 'high'
        });
      }
      
      // Playwright detection
      if (deps['@playwright/test'] && !detected.find(d => d.id === 'playwright')) {
        detected.push({
          id: 'playwright',
          name: 'Playwright',
          reason: 'Found @playwright/test in package.json',
          confidence: 'high'
        });
      }
      
      // Next.js / Vercel detection
      if (deps['next'] && !detected.find(d => d.id === 'vercel')) {
        detected.push({
          id: 'vercel',
          name: 'Vercel',
          reason: 'Found Next.js project',
          confidence: 'medium'
        });
      }
    } catch {
      // No package.json or error reading it
    }
    
    // Check for common patterns
    try {
      const files = await fs.readdir(this.projectRoot);
      
      // Look for test directories
      if (files.some(f => f.match(/^(test|tests|spec|specs|__tests__)$/i))) {
        if (!detected.find(d => d.id === 'playwright')) {
          // Suggest testing tools
          console.log('Found test directories, consider enabling testing MCPs');
        }
      }
      
      // Look for CI/CD files
      if (files.includes('.gitlab-ci.yml') || files.includes('.circleci')) {
        console.log('Found CI/CD configuration');
      }
    } catch {
      // Error reading directory
    }
    
    return detected;
  }

  async checkEnvironment() {
    const report = {
      hasGit: false,
      hasDocker: false,
      hasNode: false,
      hasPython: false,
      projectType: 'unknown'
    };
    
    // Check for Git
    try {
      await fs.access(path.join(this.projectRoot, '.git'));
      report.hasGit = true;
    } catch {}
    
    // Check for Docker
    try {
      await fs.access(path.join(this.projectRoot, 'Dockerfile'));
      report.hasDocker = true;
    } catch {}
    
    // Check for Node.js project
    try {
      await fs.access(path.join(this.projectRoot, 'package.json'));
      report.hasNode = true;
      report.projectType = 'node';
    } catch {}
    
    // Check for Python project
    try {
      await fs.access(path.join(this.projectRoot, 'requirements.txt'));
      report.hasPython = true;
      report.projectType = report.projectType === 'node' ? 'fullstack' : 'python';
    } catch {}
    
    try {
      await fs.access(path.join(this.projectRoot, 'pyproject.toml'));
      report.hasPython = true;
      report.projectType = report.projectType === 'node' ? 'fullstack' : 'python';
    } catch {}
    
    return report;
  }

  async suggestProfile() {
    const env = await this.checkEnvironment();
    const detected = await this.scan();
    
    // Suggest a profile based on what we found
    if (detected.find(d => d.id === 'supabase') || detected.find(d => d.id === 'docker')) {
      return 'backend';
    }
    
    if (detected.find(d => d.id === 'playwright') || detected.find(d => d.id === 'vercel')) {
      return 'frontend';
    }
    
    if (env.projectType === 'fullstack') {
      return 'fullstack';
    }
    
    return 'default';
  }

  async generateReport() {
    const env = await this.checkEnvironment();
    const detected = await this.scan();
    const suggestedProfile = await this.suggestProfile();
    
    return {
      environment: env,
      detectedMCPs: detected,
      suggestedProfile,
      confidence: detected.length > 0 ? 'high' : 'low',
      timestamp: new Date().toISOString()
    };
  }
}
