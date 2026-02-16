// ============================================
// DEAD PARIS - Escape Routes
// 4 multi-step quest chains
// ============================================

import World from './world.js';

const EscapeRoutes = {
    routes: {},

    init() {
        this.routes = {
            seine_boat: {
                id: 'seine_boat',
                name: 'Seine River Escape',
                discoveryFlag: 'seine_boat_discovered',
                steps: [
                    {
                        description: 'Find the boat at Port de Solferino (seine_dock)',
                        check: (gs) => gs.player.questFlags.visited_seine_dock
                    },
                    {
                        description: 'Obtain a boat engine part',
                        check: (gs) => this.hasItem(gs, 'boat_engine_part')
                    },
                    {
                        description: 'Obtain a toolbox',
                        check: (gs) => this.hasItem(gs, 'toolbox')
                    },
                    {
                        description: 'Obtain fuel (fuel_can or gasoline_can)',
                        check: (gs) => this.hasItem(gs, 'fuel_can') || this.hasItem(gs, 'gasoline_can')
                    },
                    {
                        description: 'Repair and launch the boat at seine_dock',
                        check: (gs) => gs.player.questFlags.boat_repaired
                    }
                ]
            },
            airport: {
                id: 'airport',
                name: 'CDG Airport Convoy',
                discoveryFlag: 'airport_discovered',
                steps: [
                    {
                        description: 'Assemble a military radio (radio_parts + military_radio_parts + batteries)',
                        check: (gs) => this.hasItem(gs, 'radio_parts') &&
                            this.hasItem(gs, 'military_radio_parts') &&
                            this.hasItem(gs, 'batteries')
                    },
                    {
                        description: 'Obtain car keys from Sergent Moreau',
                        check: (gs) => this.hasItem(gs, 'car_keys')
                    },
                    {
                        description: 'Obtain fuel (gasoline_can)',
                        check: (gs) => this.hasItem(gs, 'gasoline_can')
                    },
                    {
                        description: 'Obtain radio manual for frequency',
                        check: (gs) => this.hasItem(gs, 'radio_manual')
                    },
                    {
                        description: 'Drive to CDG from champs_elysees_start',
                        check: (gs) => gs.player.questFlags.airport_driving
                    }
                ]
            },
            catacombs: {
                id: 'catacombs',
                name: 'Catacomb Exodus',
                discoveryFlag: 'catacombs_discovered',
                steps: [
                    {
                        description: 'Obtain a flashlight and batteries',
                        check: (gs) => this.hasItem(gs, 'flashlight') &&
                            (this.hasItem(gs, 'batteries') || this.hasItem(gs, 'flashlight_batteries'))
                    },
                    {
                        description: 'Obtain a sewer map from Old Jean',
                        check: (gs) => this.hasItem(gs, 'sewer_map')
                    },
                    {
                        description: 'Obtain waders for the sewers',
                        check: (gs) => this.hasItem(gs, 'waders')
                    },
                    {
                        description: 'Obtain the maintenance key for the metro tunnel door',
                        check: (gs) => this.hasItem(gs, 'maintenance_key')
                    },
                    {
                        description: 'Reach the catacomb exit',
                        check: (gs) => gs.player.location === 'catacomb_exit'
                    }
                ]
            },
            helicopter: {
                id: 'helicopter',
                name: 'Rooftop Helicopter Extraction',
                discoveryFlag: 'helicopter_discovered',
                steps: [
                    {
                        description: 'Assemble a military radio (radio_parts + military_radio_parts + batteries)',
                        check: (gs) => this.hasItem(gs, 'radio_parts') &&
                            this.hasItem(gs, 'military_radio_parts') &&
                            this.hasItem(gs, 'batteries')
                    },
                    {
                        description: 'Obtain radio manual for military frequency',
                        check: (gs) => this.hasItem(gs, 'radio_manual')
                    },
                    {
                        description: 'Collect 3 flares (flare + flare_gun)',
                        check: (gs) => {
                            const flares = this.countItem(gs, 'flare');
                            const flareGun = this.hasItem(gs, 'flare_gun') ? 1 : 0;
                            return (flares + flareGun) >= 2;
                        }
                    },
                    {
                        description: 'Clear and secure the hotel rooftop',
                        check: (gs) => gs.player.questFlags.rooftop_cleared
                    },
                    {
                        description: 'Signal the helicopter from the rooftop',
                        check: (gs) => gs.player.questFlags.helicopter_signaled
                    }
                ]
            }
        };
    },

    check(gameState) {
        const messages = [];

        // Track seine_dock visit
        if (gameState.player.location === 'seine_dock' && !gameState.player.questFlags.visited_seine_dock) {
            gameState.player.questFlags.visited_seine_dock = true;
        }

        // Check for escape completions
        for (const [routeId, route] of Object.entries(this.routes)) {
            const escState = gameState.escapeRoutes[routeId];
            if (!escState) continue;

            // Discovery
            if (!escState.discovered && gameState.player.questFlags[route.discoveryFlag]) {
                escState.discovered = true;
                messages.push(`[ESCAPE ROUTE DISCOVERED: ${route.name}]`);
                messages.push(`Type 'status' to check your progress.`);
            }

            if (!escState.discovered) continue;

            // Check steps for progress updates
            let completedSteps = 0;
            for (const step of route.steps) {
                if (step.check(gameState)) completedSteps++;
            }

            // Notify progress
            if (completedSteps > escState.currentStep) {
                escState.currentStep = completedSteps;
                if (completedSteps < route.steps.length) {
                    messages.push(`[${route.name}: Step ${completedSteps}/${route.steps.length} complete]`);
                }
            }

            // Final step triggers escape
            const finalStep = route.steps[route.steps.length - 1];
            if (finalStep.check(gameState)) {
                messages.push(`ESCAPE_VICTORY:${routeId}`);
                return messages;
            }
        }

        // Special location-based triggers

        // Use items at seine_dock to repair boat
        if (gameState.player.location === 'seine_dock') {
            const has = (id) => this.hasItem(gameState, id);
            if (has('boat_engine_part') && has('toolbox') && (has('fuel_can') || has('gasoline_can'))) {
                if (!gameState.player.questFlags.boat_repair_prompted) {
                    gameState.player.questFlags.boat_repair_prompted = true;
                    messages.push('The damaged motorboat bobs against the dock. You have everything you need to repair it.');
                    messages.push('Type "use toolbox" to begin repairs and escape via the Seine.');
                }
            }
        }

        // Use radio at rooftop
        if (gameState.player.location === 'rooftop') {
            const has = (id) => this.hasItem(gameState, id);
            if (has('radio_parts') && has('military_radio_parts') && has('batteries') && has('radio_manual')) {
                if (!gameState.player.questFlags.rooftop_radio_prompted) {
                    gameState.player.questFlags.rooftop_radio_prompted = true;
                    messages.push('You have all the radio components and the frequency manual.');
                    messages.push('Type "use flare" to signal the helicopter from the rooftop.');
                    if (!gameState.player.questFlags.rooftop_cleared) {
                        gameState.player.questFlags.rooftop_cleared = true;
                    }
                }
            }
        }

        // Drive from champs_elysees
        if (gameState.player.location === 'champs_elysees_start') {
            const has = (id) => this.hasItem(gameState, id);
            if (has('car_keys') && has('gasoline_can') && has('radio_parts') &&
                has('military_radio_parts') && has('batteries') && has('radio_manual')) {
                if (!gameState.player.questFlags.airport_drive_prompted) {
                    gameState.player.questFlags.airport_drive_prompted = true;
                    messages.push('Your police car is nearby. You have fuel, keys, and a working radio.');
                    messages.push('Type "use car_keys" to start the drive to CDG airport.');
                }
            }
        }

        return messages;
    },

    getRouteStatus(gameState) {
        const lines = [];
        for (const [routeId, route] of Object.entries(this.routes)) {
            const escState = gameState.escapeRoutes[routeId];
            if (!escState?.discovered) continue;

            lines.push(`--- ${route.name} ---`);
            route.steps.forEach((step, i) => {
                const done = step.check(gameState);
                lines.push(`  ${done ? '[X]' : '[ ]'} ${step.description}`);
            });
            lines.push('');
        }
        if (lines.length === 0) {
            lines.push('No escape routes discovered yet. Explore and talk to survivors.');
        }
        return lines;
    },

    hasItem(gameState, itemId) {
        return gameState.player.inventory.some(i => i.id === itemId);
    },

    countItem(gameState, itemId) {
        const entry = gameState.player.inventory.find(i => i.id === itemId);
        return entry ? (entry.quantity || 1) : 0;
    }
};

export default EscapeRoutes;
