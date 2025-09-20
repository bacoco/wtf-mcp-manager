#!/usr/bin/env node

/**
 * Example: Complete End-to-End Orchestration
 * Demonstrates the Master MCP Orchestrator in action
 */

import { MasterMCPOrchestrator } from './lib/master-mcp-orchestrator.js';

async function demonstrateOrchestration() {
  console.log('🚀 DEMONSTRATION: Master MCP Orchestrator\n');
  console.log('=' .repeat(70));

  const orchestrator = new MasterMCPOrchestrator();

  // Scenario 1: Maritime Surveillance Project (in French)
  console.log('\n📋 SCENARIO 1: Projet de Surveillance Maritime\n');

  const maritimeProject = {
    name: "Surveillance Maritime Mer du Nord",
    description: `
      Je veux surveiller tous les cargos et tankers en mer du Nord.
      Il me faut la position des bateaux en temps réel,
      la météo marine avec hauteur des vagues et vitesse du vent,
      et des alertes si un navire entre dans une zone protégée.
    `,
    agents: [
      {
        id: "tracker_agent",
        role: "vessel_tracker",
        description: "Agent responsable du tracking des navires",
        needs: "vessel position tracking AIS data"
      },
      {
        id: "weather_agent",
        role: "weather_monitor",
        description: "Agent météo marine",
        needs: "marine weather forecast waves wind"
      },
      {
        id: "alert_agent",
        role: "alert_system",
        description: "Système d'alerte",
        needs: "geofencing alerts monitoring"
      },
      {
        id: "coordinator",
        role: "coordinator",
        description: "Coordinateur principal",
        needs: "all"
      }
    ]
  };

  console.log('🎯 Orchestrator analyzing project needs...\n');
  const maritimeResult = await orchestrator.provisionToolsForProject(maritimeProject);

  displayProjectResult(maritimeResult);

  // Scenario 2: E-commerce Payment System
  console.log('\n📋 SCENARIO 2: Système de Paiement E-commerce\n');

  const paymentProject = {
    name: "Payment Processing System",
    description: `
      Créer un système de paiement complet avec Stripe.
      Gérer les transactions, les remboursements, les factures.
      Intégrer avec notre base de données pour stocker les transactions.
    `
    // No agents specified - will create automatically
  };

  const paymentResult = await orchestrator.provisionToolsForProject(paymentProject);
  displayProjectResult(paymentResult);

  // Scenario 3: Agent requesting tools dynamically
  console.log('\n📋 SCENARIO 3: Agent Dynamique\n');
  console.log('Un agent demande des outils en temps réel...\n');

  const dynamicAllocation = await orchestrator.allocateMCPToAgent(
    "dynamic_agent_1",
    "J'ai besoin de traduire du texte et d'analyser le sentiment"
  );

  console.log('📍 Dynamic Allocation Result:');
  console.log(`   Success: ${dynamicAllocation.success}`);
  console.log(`   Message: ${dynamicAllocation.message}`);
  if (dynamicAllocation.tools) {
    console.log(`   Tools allocated: ${dynamicAllocation.tools.length}`);
    dynamicAllocation.tools.forEach(tool => {
      console.log(`     - ${tool.name}`);
    });
  }

  // Show global status
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 GLOBAL ORCHESTRATOR STATUS\n');

  const status = orchestrator.getStatus();
  console.log(`Active MCPs: ${status.active_mcps}`);
  console.log(`Allocated Agents: ${status.allocated_agents}`);
  console.log(`Active Projects: ${status.projects}`);

  console.log('\n🔧 Generated MCPs:');
  status.mcps.forEach(mcp => {
    console.log(`   - ${mcp.id}`);
    console.log(`     API: ${mcp.api}`);
    console.log(`     Tools: ${mcp.tools}`);
    console.log(`     Status: ${mcp.status}`);
  });

  console.log('\n🤖 Agent Allocations:');
  status.agents.forEach(agent => {
    console.log(`   - ${agent.id} (${agent.role})`);
    console.log(`     MCPs: ${agent.mcps}`);
    console.log(`     Total Tools: ${agent.tools}`);
  });

  // Cleanup
  console.log('\n🧹 Cleaning up unused MCPs...');
  orchestrator.cleanup();

  console.log('\n✨ Demonstration complete!\n');
}

function displayProjectResult(result) {
  console.log(`📌 Project: ${result.project}`);
  console.log(`   Status: ${result.status}`);

  if (result.needs && result.needs.keywords) {
    console.log(`\n   🔍 Identified Needs:`);
    console.log(`      Keywords: ${result.needs.keywords.join(', ')}`);
    console.log(`      Domains: ${result.needs.domains.join(', ')}`);
  }

  console.log(`\n   🌐 APIs Found: ${result.apis_found.length}`);
  result.apis_found.slice(0, 3).forEach(api => {
    console.log(`      - ${api.name} (Score: ${api.score}, Viable: ${api.viable})`);
  });

  console.log(`\n   🏗️  MCPs Generated: ${result.mcps_generated.length}`);
  result.mcps_generated.forEach(mcp => {
    console.log(`      - ${mcp.id}`);
    console.log(`        API: ${mcp.api}`);
    console.log(`        Tools: ${mcp.tools}`);
    console.log(`        Status: ${mcp.status}`);
  });

  console.log(`\n   🤖 Agent Configurations: ${result.agent_configurations.length}`);
  result.agent_configurations.forEach(agent => {
    console.log(`      - ${agent.id} (${agent.role})`);
    console.log(`        MCPs assigned: ${agent.mcps.join(', ') || 'none'}`);
    console.log(`        Tools available: ${agent.tools.length}`);
  });

  if (result.error) {
    console.log(`\n   ❌ Error: ${result.error}`);
  }
}

// Example of how an agent would use the allocated tools
class SmartAgent {
  constructor(id, role, orchestrator) {
    this.id = id;
    this.role = role;
    this.orchestrator = orchestrator;
    this.tools = [];
  }

  async initialize(needs) {
    // Request tools from orchestrator
    const allocation = await this.orchestrator.allocateMCPToAgent(this.id, needs);

    if (allocation.success) {
      this.tools = allocation.tools;
      console.log(`Agent ${this.id} initialized with ${this.tools.length} tools`);
    }

    return allocation;
  }

  async performTask(task) {
    // Use allocated tools transparently
    console.log(`Agent ${this.id} performing: ${task}`);

    // Tools are ready to use via MCP protocol
    // In real implementation, this would call the actual MCP tools
    for (const tool of this.tools) {
      if (task.toLowerCase().includes(tool.name)) {
        console.log(`   Using tool: ${tool.name}`);
        // await this.mcp.call(tool.name, task.params);
      }
    }
  }
}

// Demonstrate smart agent
async function demonstrateSmartAgent() {
  console.log('\n' + '='.repeat(70));
  console.log('\n🤖 SMART AGENT DEMONSTRATION\n');

  const orchestrator = new MasterMCPOrchestrator();

  // Create a smart agent
  const agent = new SmartAgent("smart_agent_1", "researcher", orchestrator);

  // Agent describes what it needs in French
  await agent.initialize("Je dois rechercher des informations sur les cryptomonnaies et analyser les prix");

  // Agent performs tasks using its allocated tools
  await agent.performTask("Get current Bitcoin price");
  await agent.performTask("Analyze crypto market trends");
}

// Run demonstrations
async function main() {
  try {
    await demonstrateOrchestration();
    await demonstrateSmartAgent();
  } catch (error) {
    console.error('Error in demonstration:', error);
  }
}

// Execute
main().catch(console.error);