package expo.modules.sherpatts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

private const val MODEL_ARCHIVE_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-de_DE-dii-high.tar.bz2"
private const val MODEL_FOLDER = "vits-piper-de_DE-dii-high"
private const val MODEL_FILE = "de_DE-dii-high.onnx"
private const val OLD_MODEL_FOLDER = "vits-piper-de_DE-thorsten-medium"

class SherpaTtsModule : Module() {
  private val worker = Executors.newSingleThreadExecutor()
  private val stopped = AtomicBoolean(true)
  @Volatile private var audioTrack: AudioTrack? = null
  @Volatile private var engine: OfflineTts? = null

  override fun definition() = ModuleDefinition {
    Name("SherpaTts")
    Events("downloadProgress")

    AsyncFunction("speak") { text: String, promise: expo.modules.kotlin.Promise ->
      stopped.set(false)
      worker.execute {
        try {
          if (stopped.get()) {
            promise.resolve(null)
            return@execute
          }
          val modelDir = ensureModel()
          if (stopped.get()) {
            promise.resolve(null)
            return@execute
          }
          val tts = getEngine(modelDir)
          val audio = tts.generate(text, 0, 0.9f)
          if (!stopped.get()) play(audio.samples, audio.sampleRate)
          promise.resolve(null)
        } catch (error: Throwable) {
          val wasStopped = stopped.get()
          stopped.set(true)
          if (error is InterruptedException || wasStopped) {
            promise.resolve(null)
          } else {
            promise.reject("E_SHERPA_TTS", error.message ?: "German voice could not be prepared", error)
          }
        } finally {
          releaseTrack()
        }
      }
    }

    Function("stop") {
      stopped.set(true)
      releaseTrack()
    }

    OnDestroy {
      stopped.set(true)
      releaseTrack()
      engine?.release()
      engine = null
      worker.shutdownNow()
    }
  }

  private fun modelDirectory(): File = File(appContext.reactContext!!.filesDir, MODEL_FOLDER)

  private fun modelReady(folder: File): Boolean {
    val data = File(folder, "espeak-ng-data")
    return File(folder, MODEL_FILE).length() > 0 &&
      File(folder, "tokens.txt").length() > 0 &&
      File(data, "phontab").exists() && File(data, "phondata").exists() &&
      File(data, "phonindex").exists() && File(data, "intonations").exists()
  }

  private fun ensureModel(): File {
    File(modelDirectory().parentFile, OLD_MODEL_FOLDER).deleteRecursively()
    val target = modelDirectory()
    if (modelReady(target)) return target

    val partial = File(target.parentFile, "$MODEL_FOLDER.partial")
    partial.deleteRecursively()
    partial.mkdirs()
    var connection: HttpURLConnection? = null
    try {
      connection = (URL(MODEL_ARCHIVE_URL).openConnection() as HttpURLConnection).apply {
        connectTimeout = 20_000
        readTimeout = 60_000
        instanceFollowRedirects = true
        connect()
      }
      if (connection.responseCode !in 200..299) {
        throw IllegalStateException("Voice download failed (HTTP ${connection.responseCode}).")
      }
      val total = connection.contentLengthLong
      val decompressor = BZip2CompressorInputStream(BufferedInputStream(connection.inputStream))
      val input = TarArchiveInputStream(decompressor)
      input.use { tar ->
        var entry = tar.nextTarEntry
        val buffer = ByteArray(64 * 1024)
        var lastProgress = -1
        while (entry != null) {
          if (stopped.get()) throw InterruptedException("Voice setup cancelled")
          val normalized = entry.name.replace('\\', '/')
          val relative = normalized.substringAfter("$MODEL_FOLDER/", "")
          if (relative.isNotEmpty() && !entry.isDirectory && !entry.isSymbolicLink &&
            !relative.startsWith("/") && relative.split('/').none { it == ".." }) {
            val output = File(partial, relative)
            output.parentFile?.mkdirs()
            FileOutputStream(output).use { stream ->
              var count = tar.read(buffer)
              while (count >= 0) {
                if (stopped.get()) throw InterruptedException("Voice setup cancelled")
                if (count > 0) {
                  stream.write(buffer, 0, count)
                }
                count = tar.read(buffer)
              }
            }
          } else if (entry.isFile) {
            var count = tar.read(buffer)
            while (count >= 0) {
              if (stopped.get()) throw InterruptedException("Voice setup cancelled")
              count = tar.read(buffer)
            }
          }
          if (total > 0) {
            val progress = (decompressor.compressedCount * 100 / total).toInt().coerceIn(0, 99)
            if (progress > lastProgress) {
              sendEvent("downloadProgress", mapOf("progress" to progress))
              lastProgress = progress
            }
          }
          entry = tar.nextTarEntry
        }
      }
      if (!modelReady(partial)) throw IllegalStateException("Downloaded voice model is incomplete. Please try again.")
      target.deleteRecursively()
      if (!partial.renameTo(target)) throw IllegalStateException("Could not save the German voice model.")
      sendEvent("downloadProgress", mapOf("progress" to 100))
      return target
    } catch (error: Throwable) {
      partial.deleteRecursively()
      throw error
    } finally {
      connection?.disconnect()
    }
  }

  private fun getEngine(folder: File): OfflineTts {
    engine?.let { return it }
    val config = OfflineTtsConfig(
      model = OfflineTtsModelConfig(
        vits = OfflineTtsVitsModelConfig(
          model = File(folder, MODEL_FILE).absolutePath,
          tokens = File(folder, "tokens.txt").absolutePath,
          dataDir = File(folder, "espeak-ng-data").absolutePath,
        ),
        numThreads = 2,
        debug = false,
      ),
    )
    // Model paths point to filesDir, so load from the filesystem instead of Android assets.
    return OfflineTts(config = config).also { engine = it }
  }

  private fun play(samples: FloatArray, sampleRate: Int) {
    val minBytes = AudioTrack.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_FLOAT,
    ).coerceAtLeast(4096)
    val track = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build(),
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(sampleRate)
          .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build(),
      )
      .setBufferSizeInBytes(max(minBytes, minOf(samples.size * 4, sampleRate * 4)))
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
    audioTrack = track
    track.play()
    var offset = 0
    while (offset < samples.size && !stopped.get()) {
      val written = track.write(samples, offset, samples.size - offset, AudioTrack.WRITE_BLOCKING)
      if (written < 0) throw IllegalStateException("Audio playback failed ($written).")
      offset += written
    }
    while (!stopped.get() && track.playbackHeadPosition < samples.size) Thread.sleep(20)
    releaseTrack()
  }

  private fun releaseTrack() {
    val current = audioTrack ?: return
    audioTrack = null
    try { current.pause() } catch (_: Throwable) {}
    try { current.flush() } catch (_: Throwable) {}
    try { current.release() } catch (_: Throwable) {}
  }
}
