import { MD3DarkTheme, configureFonts } from 'react-native-paper';

const fonts = configureFonts({ config: { fontFamily: 'System' } });

export const theme = {
    ...MD3DarkTheme,
    fonts,
    colors: {
        ...MD3DarkTheme.colors,
        primary: '#2DD4A8',
        primaryContainer: '#0D3D30',
        secondary: '#F5A623',
        secondaryContainer: '#3D2E0A',
        tertiary: '#6C63FF',
        background: '#0A0F1A',
        surface: '#111827',
        surfaceVariant: '#1A2332',
        surfaceDisabled: '#1A2332',
        error: '#EF4444',
        errorContainer: '#3B1212',
        onPrimary: '#FFFFFF',
        onPrimaryContainer: '#2DD4A8',
        onSecondary: '#000000',
        onSecondaryContainer: '#F5A623',
        onBackground: '#F1F5F9',
        onSurface: '#F1F5F9',
        onSurfaceVariant: '#94A3B8',
        onSurfaceDisabled: '#475569',
        onError: '#FFFFFF',
        outline: '#1E293B',
        outlineVariant: '#334155',
        elevation: {
            level0: 'transparent',
            level1: '#111827',
            level2: '#1A2332',
            level3: '#1E293B',
            level4: '#243344',
            level5: '#2A3A4E',
        },
    },
    roundness: 12,
};

export const Colors = {
    bg: '#0A0F1A',
    card: '#111827',
    cardBorder: '#1E293B',
    surface: '#1A2332',
    primary: '#2DD4A8',
    accent: '#F5A623',
    danger: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    border: '#1E293B',
    success: '#10B981',
};
