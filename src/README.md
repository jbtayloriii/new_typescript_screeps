# Typescript Screeps code

## Overview
This codebase roughly tries to break down a screeps player's empire into the following abstractions:

- Headquarters: A singleton that handles top level management of memory, creating bases, and telling them to run.
- Base: Represents a single controlled room, the creeps created here, and the actions that happen. This potentially includes scouting/attacking other rooms.
- Creep Handler: A wrapper around a single creep that defines its role, handles its state via Memory, and its specific actions tied to its state.

## General flow

There is some small initialization code outside the main game loop:
- A Headquarters instance is created 