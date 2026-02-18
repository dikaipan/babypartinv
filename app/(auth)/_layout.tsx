import { Stack } from 'expo-router';
import { Colors } from '../../src/config/theme';

export default function AuthLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Colors.bg },
            }}
        />
    );
}
