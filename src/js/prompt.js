<!-- Prompt Generation Modal -->
<div id="prompt-modal" class="modal-overlay">
    <div class="modal-content">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-primary">Generate AI Prompt</h2>
            <button id="close-prompt-modal-btn" class="text-secondary hover:text-primary">&times;</button>
        </div>
        <form id="prompt-form" class="space-y-4">
            <textarea id="basic-prompt-input" placeholder="Enter a basic prompt..." class="w-full p-3 rounded-md bg-secondary border-color text-primary focus:outline-none focus:ring-2 focus:ring-purple-500" required></textarea>
            <button type="submit" id="generate-prompt-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition">Generate Prompt</button>
        </form>
        <div id="generated-prompt" class="mt-4 text-secondary"></div>
        <div id="recommended-tool" class="mt-4 text-primary font-semibold"></div>
    </div>
</div>