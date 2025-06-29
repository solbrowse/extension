import { useEffect, useState } from 'react';
import { get, set, StorageData } from '@src/services/storage';

export function useTheme() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial theme from storage
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const settings = await get();
        const darkMode = settings.darkMode || false;
        setIsDarkMode(darkMode);
        
        // Apply theme to document
        if (darkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTheme();
  }, []);

  // Toggle theme
  const toggleTheme = async () => {
    try {
      const settings = await get();
      const newDarkMode = !settings.darkMode;
      
      // Update storage
      await set({ ...settings, darkMode: newDarkMode });
      
      // Update local state
      setIsDarkMode(newDarkMode);
      
      // Apply to document
      if (newDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      console.error('Error toggling theme:', error);
    }
  };

  // Set theme directly
  const setTheme = async (darkMode: boolean) => {
    try {
      const settings = await get();
      
      // Update storage
      await set({ ...settings, darkMode });
      
      // Update local state
      setIsDarkMode(darkMode);
      
      // Apply to document
      if (darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      console.error('Error setting theme:', error);
    }
  };

  return {
    isDarkMode,
    isLoading,
    toggleTheme,
    setTheme,
  };
}