import { evaluateTagDragOnUserUpdate } from '../commands/vcdrag.js';

export default {
  name: 'userUpdate',
  once: false,
  async execute(oldUser, newUser) {
    try {
      const client = newUser?.client || oldUser?.client;
      if (!client) return;
      await evaluateTagDragOnUserUpdate(client, oldUser, newUser);
    } catch (error) {
      console.error('Error handling userUpdate for tagdrag:', error);
    }
  }
};
