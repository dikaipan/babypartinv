import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Portal, Snackbar as PaperSnackbar, SnackbarProps, Text, useTheme } from 'react-native-paper';

type AppSnackbarProps = Omit<SnackbarProps, 'wrapperStyle'> & {
    wrapperStyle?: StyleProp<ViewStyle>;
};

export default function AppSnackbar({ style, wrapperStyle, ...props }: AppSnackbarProps) {
    const theme = useTheme();
    const textColor = theme.colors.inverseOnSurface;
    const content = typeof props.children === 'string'
        ? <Text style={[styles.message, { color: textColor }]}>{props.children}</Text>
        : props.children;

    return (
        <Portal>
            <PaperSnackbar
                {...props}
                contentStyle={styles.content}
                wrapperStyle={[styles.wrapper, wrapperStyle]}
                style={[styles.snackbar, style]}
            >
                {content}
            </PaperSnackbar>
        </Portal>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
        paddingHorizontal: 16,
        bottom: 8,
    },
    snackbar: {
        width: '100%',
        maxWidth: 520,
        borderRadius: 12,
    },
    content: {
        alignItems: 'center',
    },
    message: {
        width: '100%',
        textAlign: 'center',
    },
});
