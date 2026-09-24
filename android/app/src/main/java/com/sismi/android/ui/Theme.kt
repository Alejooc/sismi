package com.sismi.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val SismiLightColors = lightColorScheme(
    primary = Color(0xFF397A5D),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE0EFE5),
    onPrimaryContainer = Color(0xFF19432F),
    secondary = Color(0xFF5E796A),
    secondaryContainer = Color(0xFFE9F1EB),
    onSecondaryContainer = Color(0xFF243C2D),
    tertiary = Color(0xFF6E7D73),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFEEF2EF),
    onTertiaryContainer = Color(0xFF29342D),
    background = Color(0xFFF3F6F3),
    surface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFFF0F4F1),
    onSurface = Color(0xFF19201C),
    onSurfaceVariant = Color(0xFF5D6861),
    outline = Color(0xFFE0E7E2),
    outlineVariant = Color(0xFFE9EEEA),
    error = Color(0xFFB33D3D),
)

private val SismiDarkColors = darkColorScheme(
    primary = Color(0xFF9CCFB1),
    onPrimary = Color(0xFF123B29),
    primaryContainer = Color(0xFF1B2821),
    onPrimaryContainer = Color(0xFFD9EFE1),
    secondary = Color(0xFFB4CDBB),
    secondaryContainer = Color(0xFF1D241F),
    onSecondaryContainer = Color(0xFFDCE9DF),
    tertiary = Color(0xFFC2CCC5),
    onTertiary = Color(0xFF26302A),
    tertiaryContainer = Color(0xFF232A25),
    onTertiaryContainer = Color(0xFFDFE6E0),
    background = Color(0xFF080B09),
    surface = Color(0xFF111512),
    surfaceVariant = Color(0xFF1B211D),
    onSurface = Color(0xFFF0F4F1),
    onSurfaceVariant = Color(0xFFB0BBB3),
    outline = Color(0xFF39433C),
    outlineVariant = Color(0xFF29312B),
    error = Color(0xFFFF8A80),
)

private val SismiTypography = Typography(
    titleLarge = TextStyle(fontSize = 21.sp, lineHeight = 27.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.25).sp),
    titleMedium = TextStyle(fontSize = 17.sp, lineHeight = 23.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.15).sp),
    titleSmall = TextStyle(fontSize = 15.sp, lineHeight = 21.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 23.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 19.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 15.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun SismiTheme(darkMode: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkMode) SismiDarkColors else SismiLightColors,
        typography = SismiTypography,
        content = content,
    )
}
