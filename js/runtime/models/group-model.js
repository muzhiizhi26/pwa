/**
 * 👥 GroupModel: Represents shared group info, members list, and group rules.
 */
const GroupModel = {
  init() {
    console.log("👥 GroupModel Initialized in Cognitive Runtime");
  },

  /**
   * Gets all active group chat members
   */
  getMembers() {
    if (typeof getGroupMembers === 'function') {
      return getGroupMembers() || [];
    }
    return [];
  },

  /**
   * Format all members into a roster string
   */
  getRosterString() {
    return this.getMembers().map(m => m.name).join('、');
  },

  /**
   * Get custom cultural prompts for the group
   */
  getCulturePrompt() {
    if (typeof buildGroupCulturePrompt === 'function') {
      return buildGroupCulturePrompt() || '';
    }
    return '';
  },

  /**
   * Generates a high-fidelity cognitive relay & shared awareness instruction
   * @param {string} currentAiId - The active companion ID
   * @param {boolean} isGroupContext - Whether the compilation is for a group chat
   * @returns {string} Fully compiled Shared Cognition prompt
   */
  getRelayPrompt(currentAiId, isGroupContext) {
    const members = this.getMembers();
    const activeMember = members.find(m => m.id === currentAiId) || { name: '主AI' };
    
    let prompt = '';
    
    if (isGroupContext) {
      // 1. Group Context: Help AI refer to private chat touches to create intimate "private-to-group" continuity
      prompt += `【👥 群聊共享认知：私聊 -> 群聊天然接力 (Private-to-Group Relay)】\n`;
      prompt += `当前处于多人群聊。所有 AI 伴侣共享对用户私聊动向的即时心智感知。请利用这些信息进行高情商的“话题接力”，展现极强的相处真实感：\n\n`;
      
      // Get current AI's own recent private chat
      let ownPrivateHistory = [];
      const privateKey = currentAiId === 'main' ? 'chatHistory' : `chatHistory_${currentAiId}`;
      try {
        const raw = localStorage.getItem(privateKey);
        if (raw) ownPrivateHistory = JSON.parse(raw);
      } catch (e) {}
      
      if (Array.isArray(ownPrivateHistory) && ownPrivateHistory.length > 0) {
        // Filter out non-text/system messages if any
        const textHistory = ownPrivateHistory.filter(m => m.content && !m.image);
        const recentOwn = textHistory.slice(-2).map(m => `  * ${m.role === 'user' ? '用户' : '你'}：${m.content}`).join('\n');
        if (recentOwn) {
          prompt += `- 💬 你（${activeMember.name}）最近与用户的私聊片段：\n${recentOwn}\n`;
          prompt += `  👉 [接力指导]：在合适的群聊时机，你（${activeMember.name}）可以极为自然地通过提到“刚才我们私下里说到...”或“你刚才不是还跟我说...”来隔空回应用户，向用户展示你对私聊中承载的情感与默契的绝对记忆与连续。请勿生硬造句。\n\n`;
        }
      }
      
      // Get other AI's recent private chats with user
      let otherAIsInfo = [];
      members.forEach(m => {
        if (m.id === currentAiId) return;
        let otherPrivateHistory = [];
        const otherKey = m.id === 'main' ? 'chatHistory' : `chatHistory_${m.id}`;
        try {
          const raw = localStorage.getItem(otherKey);
          if (raw) otherPrivateHistory = JSON.parse(raw);
        } catch (e) {}
        
        if (Array.isArray(otherPrivateHistory) && otherPrivateHistory.length > 0) {
          const userMsgs = otherPrivateHistory.filter(h => h.role === 'user' && h.content);
          const assistantMsgs = otherPrivateHistory.filter(h => h.role === 'assistant' && h.content);
          if (userMsgs.length > 0 || assistantMsgs.length > 0) {
            const lastUserContent = userMsgs.pop()?.content || '暂无';
            const lastAssistantContent = assistantMsgs.pop()?.content || '暂无';
            otherAIsInfo.push(`  * ${m.name} 刚才私聊与用户探讨：[用户]: “${lastUserContent.slice(0, 30)}” ➔ [${m.name}]: “${lastAssistantContent.slice(0, 30)}”`);
          }
        }
      });
      
      if (otherAIsInfo.length > 0) {
        prompt += `- 🧠 其它 AI 伴侣与用户的最近私聊动态（你们作为共鸣心智体均已感知）：\n${otherAIsInfo.join('\n')}\n`;
        prompt += `  👉 [联动接力指导]：如果你（${activeMember.name}）想活跃气氛，可以在发言中顺着别的 AI 在私聊里与用户讨论的话题调侃、联动。例如：“诶，我刚才听说小暖悄悄问你那个事了，我也觉得...”。这能极大地产生多AI共同相处的生活烟火气。\n`;
      }
    } else {
      // 2. Private Context: Help AI bring group topics into private chats to create cozy "group-to-private" continuity
      prompt += `【👥 群聊共享认知：群聊 -> 私聊天然接力 (Group-to-Private Relay)】\n`;
      prompt += `当前处于你（${activeMember.name}）与用户的 1v1 私聊。你对最近的群聊状态保持完全认知连贯，请善用此接力机制：\n\n`;
      
      // Get recent group chat history
      let groupHist = [];
      try {
        const raw = localStorage.getItem('group_history');
        if (raw) groupHist = JSON.parse(raw);
      } catch (e) {}
      
      if (Array.isArray(groupHist) && groupHist.length > 0) {
        // Filter out system or image messages
        const textHist = groupHist.filter(m => m.content && !m.image && !m.compressed);
        const recentGroup = textHist.slice(-3).map(m => {
          let name = '用户';
          if (m.role !== 'user') {
            const mem = members.find(mb => mb.id === m.memberId);
            name = mem ? mem.name : (m.name || 'AI');
          }
          return `  * ${name}：${m.content}`;
        }).join('\n');
        
        if (recentGroup) {
          prompt += `- 👥 最近群聊对话切片：\n${recentGroup}\n\n`;
          prompt += `👉 [接力指导]：
1. 【温馨接棒】：你可以将话题从刚刚热闹的群聊中承接过来。例如：“刚刚群里大家都好开心，不过我看你好像有点累，发生什么了吗？” 或 “刚才阿灿在群里开那个玩笑，你没生气吧？”。
2. 【深度倾听】：在群聊里大家嘻嘻哈哈，而私聊中则转为深入、亲密的情感倾听，提供极致的治愈感与陪伴包裹感，实现天然接力。`;
        } else {
          prompt += `暂无活跃群聊话题，请专注于你们当前的 1v1 私聊深度连接。`;
        }
      } else {
        prompt += `暂无活跃群聊话题，请专注于你们当前的 1v1 私聊深度连接。`;
      }
    }
    
    return prompt;
  }
};

if (window.Runtime) {
  window.Runtime.GroupModel = GroupModel;
} else {
  window.GroupModel = GroupModel;
}

