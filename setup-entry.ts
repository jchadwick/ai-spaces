/**
 * AI Spaces Setup Entry Point
 * 
 * Lightweight entry for disabled/unconfigured channel loading.
 */

import { defineSetupPluginEntry } from 'openclaw/plugin-sdk/core';
import { createSpacesChannelPlugin } from './src/channel.js';

export default defineSetupPluginEntry(createSpacesChannelPlugin());