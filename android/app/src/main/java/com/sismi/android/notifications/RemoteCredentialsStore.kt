package com.sismi.android.notifications

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class RemoteCredentialsStore(context: Context) {
    private val preferences = context.getSharedPreferences("sismi-remote-private", Context.MODE_PRIVATE)

    fun saveDeviceToken(token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val encoded = "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}.${Base64.encodeToString(ciphertext, Base64.NO_WRAP)}"
        preferences.edit().putString(DEVICE_TOKEN_KEY, encoded).apply()
    }

    fun loadDeviceToken(): String? {
        val stored = preferences.getString(DEVICE_TOKEN_KEY, null) ?: return null
        return runCatching {
            val parts = stored.split('.', limit = 2)
            require(parts.size == 2)
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
            cipher.doFinal(ciphertext).toString(Charsets.UTF_8)
        }.getOrElse {
            preferences.edit().remove(DEVICE_TOKEN_KEY).apply()
            null
        }
    }

    fun clearDeviceToken() {
        preferences.edit().remove(DEVICE_TOKEN_KEY).apply()
    }

    fun isRegistered(): Boolean = loadDeviceToken() != null

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val KEY_ALIAS = "com.sismi.android.remote-device-token"
        const val DEVICE_TOKEN_KEY = "device_token"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
