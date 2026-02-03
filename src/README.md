# Typescript Screeps code

## Overview
This codebase breaks down a screeps player's empire into the following abstractions:

- Headquarters: A singleton that handles top level management of memory, creating bases, and telling them to run. This is mainly just a multiplexer.

- Base: Represents a single controlled room, the creeps created here, and the actions that happen. This potentially includes scouting/attacking other rooms.

- Task: A single goal within Screeps. Tasks are sometimes long-lived (or indefinite) and may involve coordinating multiple creeps/rooms, although they are created and maintained by individual bases.

- Creep Handler: A wrapper around a single creep that defines its role, handles its state via Memory, and its specific actions tied to its state.

## General flow

There is some initialization code outside the main game loop:
- A Headquarters instance is created 
- Memory structures are initialized, and old memory may be deleted

Within the game loop:

(0). Bases are created, if necessary
1. Bases go through a planning phase where new tasks may be created, and other planning (such as construction site layouts) may happen.
2. Bases go through a resource allocation phase where resources (spawns for now) are used by tasks, by priority.
3. Bases run their tasks, which in turn run creeps/structures.
4. Bases clean up. This currently includes removing tasks that are no longer necessary.


## Testing

Testing uses Jest:

`yarn run jest`
