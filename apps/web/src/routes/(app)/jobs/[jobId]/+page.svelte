<script lang="ts">
  import { page } from "$app/state";
  import JobDetail from "../../../../../../../packages/client/src/pages/JobDetail.svelte";
</script>
<JobDetail jobId={page.params.jobId} />
