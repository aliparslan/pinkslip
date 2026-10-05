<script lang="ts">
  import { page } from "$app/state";
  import Tailor from "../../../../../../../packages/client/src/pages/Tailor.svelte";
</script>
<Tailor jobId={page.params.jobId} />
