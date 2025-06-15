import { get } from '@src/utils/storage';
import { injectComponent } from '@src/utils/inject';
import { parseKeybind, matchesKeybind } from '@src/utils/keybind';
import AskBar from './AskBar';
import askBarStyles from './askBarStyles.css?inline';
import { Message } from '@src/utils/storage';

let askBarVisible = false;

// Tab-specific conversation storage
const TAB_CONVERSATION_KEY = 'sol-tab-conversation';

function getTabConversation(): { messages: Message[], conversationId: string | null } {
  try {
    const stored = sessionStorage.getItem(TAB_CONVERSATION_KEY);
    return stored ? JSON.parse(stored) : { messages: [], conversationId: null };
  } catch {
    return { messages: [], conversationId: null };
  }
}

function setTabConversation(messages: Message[], conversationId: string | null) {
  try {
    sessionStorage.setItem(TAB_CONVERSATION_KEY, JSON.stringify({ messages, conversationId }));
  } catch (error) {
    console.error('Sol: Failed to save tab conversation:', error);
  }
}

function clearTabConversation() {
  try {
    sessionStorage.removeItem(TAB_CONVERSATION_KEY);
  } catch (error) {
    console.error('Sol: Failed to clear tab conversation:', error);
  }
}

async function main() {
  const settings = await get();
  
  if (!settings.features.aiSearch.isEnabled) {
    return;
  }
  
  const targetKeybind = parseKeybind(settings.features.aiSearch.keybind);

  // Clear conversation when navigating to a new page/site
  let currentUrl = window.location.href;
  
  const handleNavigation = () => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      clearTabConversation();
      
      // Simply hide the AskBar if it's visible
      if (askBarVisible) {
        askBarVisible = false;
      }
    }
  };

  // Listen for navigation changes
  window.addEventListener('popstate', handleNavigation);
  
  // Override pushState and replaceState to catch programmatic navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    setTimeout(handleNavigation, 0);
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    setTimeout(handleNavigation, 0);
  };

  document.addEventListener('keydown', (event) => {
    if (matchesKeybind(event, targetKeybind)) {
      if (!askBarVisible) {
        askBarVisible = true;
        
        // Get existing conversation for this tab
        const tabConversation = getTabConversation();
        
        injectComponent({
          id: "sol-ask-bar",
          Component: AskBar,
          props: {
            position: settings.features.aiSearch.position,
            initialConversation: tabConversation.messages,
            initialConversationId: tabConversation.conversationId,
            onConversationUpdate: (messages: Message[], conversationId: string | null) => {
              setTabConversation(messages, conversationId);
            }
          },
          styles: askBarStyles,
          fontLinks: [
            "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          ],
          onUnmount: () => {
            askBarVisible = false;
          }
        });
      }
    }
  });

  console.log('Sol AI Search listener active.');
}

main().catch(console.error);
