/*using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class CameraFollow : MonoBehaviour {

	public Transform carTransform;
	[Range(1, 10)]
	public float followSpeed = 2;
	[Range(1, 10)]
	public float lookSpeed = 5;
	Vector3 initialCameraPosition;
	Vector3 initialCarPosition;
	Vector3 absoluteInitCameraPosition;

	void Start(){
		initialCameraPosition = gameObject.transform.position;
		initialCarPosition = carTransform.position;
		absoluteInitCameraPosition = initialCameraPosition - initialCarPosition;
	}

	void FixedUpdate()
	{
		//Look at car
		// Vector3 _lookDirection = (new Vector3(carTransform.position.x, carTransform.position.y, carTransform.position.z)) - transform.position;
		// Quaternion _rot = Quaternion.LookRotation(_lookDirection, Vector3.up);
		// transform.rotation = Quaternion.Lerp(transform.rotation, _rot, lookSpeed * Time.deltaTime);

		//Move to car
		Vector3 _targetPos = absoluteInitCameraPosition + carTransform.transform.position;
		transform.position = Vector3.Lerp(transform.position, _targetPos, followSpeed * Time.deltaTime);

	}

}

*/
using UnityEngine;
using System.Collections;

public class CameraFollow : MonoBehaviour
{
    [Header("跟随设置")]
    public Transform carTransform;

    [Range(1, 10)] public float followSpeed = 2;
    [Range(1, 10)] public float lookSpeed = 5;

    [Header("遮挡处理")]
    public bool enable = false;
    [SerializeField] private LayerMask occlusionMask;  // 需要透明的障碍物层级（如"Wall"）
    //[SerializeField] private float fadeAlpha = 0.3f;   // 透明时的Alpha值
    //[SerializeField] private float fadeSpeed = 5f;     // 透明度变化速度
    [SerializeField] private float checkInterval = 0.2f; // 检测间隔

    private Vector3 initialCameraPosition;
    private Vector3 initialCarPosition;
    private Vector3 absoluteInitCameraPosition;
    private RendererTimerManager rendererTimerManager;
    private AdvancedMouseSelector carSelector;
    //private Renderer currentTransparentObj; // 当前被透明的物体
    //private Material[] originalMaterials;   // 原始材质备份

    void Start()
    {
        initialCameraPosition = transform.position;
        initialCarPosition = carTransform.position;
        absoluteInitCameraPosition = initialCameraPosition - initialCarPosition;
        carSelector = AdvancedMouseSelector.Instance;
        if (enable)
        {
            rendererTimerManager = RendererTimerManager.Instance;
            StartCoroutine(OcclusionCheck()); // 启动遮挡检测协程
        }
    }

    void FixedUpdate()
    {
        // 跟随目标移动
        Vector3 targetPos = absoluteInitCameraPosition + carTransform.position;
        transform.position = Vector3.Lerp(transform.position, targetPos, followSpeed * Time.deltaTime);
    }

    // 协程：间隔检测遮挡
    IEnumerator OcclusionCheck()
    {
        while (true)
        {
            yield return new WaitForSeconds(checkInterval);
            CheckClosestOccluder();
        }
    }

    // 检测最近的遮挡物
    private void CheckClosestOccluder()
    {
        Ray ray = new Ray(transform.position, carTransform.position - transform.position);
        float maxDistance = Vector3.Distance(transform.position, carTransform.position);

        // 射线检测并找到最近的碰撞体
        RaycastHit[] hits = Physics.RaycastAll(ray, maxDistance, occlusionMask);
        RaycastHit closestHit = new RaycastHit();
        bool hasHit = false;

        foreach (RaycastHit hit in hits)
        {
            if (hit.distance < closestHit.distance || !hasHit)
            {
                closestHit = hit;
                hasHit = true;
            }
        }

        // 处理透明逻辑
        if (hasHit)
        {
            Renderer hitRenderer = closestHit.collider.GetComponent<Renderer>();
            if (hitRenderer != null)
            {
                rendererTimerManager.AddRenderer(hitRenderer);
                // 如果命中新物体，恢复旧物体并记录新物体
                //if (currentTransparentObj != hitRenderer)
                //{
                //    RestoreOriginalMaterials();
                //    SaveOriginalMaterials(hitRenderer);
                //    currentTransparentObj = hitRenderer;
                //}
                //ApplyTransparency(hitRenderer); // 渐变透明度
            }
        }
        else
        {
            //RestoreOriginalMaterials(); // 无遮挡时恢复原有材质
        }
    }

    // 保存原始材质
   // private void SaveOriginalMaterials(Renderer renderer)
   // {
   //     originalMaterials = new Material[renderer.materials.Length];
   //     for (int i = 0; i < renderer.materials.Length; i++)
   //     {
   //         originalMaterials[i] = new Material(renderer.materials[i]);
   //     }
   // }

   // // 应用透明度
   // private void ApplyTransparency(Renderer renderer)
   // {
   //     foreach (Material mat in renderer.materials)
   //     {
   //         Color color = mat.color;
   //         float targetAlpha = Mathf.Lerp(color.a, fadeAlpha, fadeSpeed * Time.deltaTime);
   //         mat.color = new Color(color.r, color.g, color.b, targetAlpha);
   //         mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
   //         mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
   //         mat.EnableKeyword("_ALPHABLEND_ON");
   //         mat.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
   //     }
   // }

   // // 恢复原始材质
   // private void RestoreOriginalMaterials()
   // {
   //     if (currentTransparentObj != null && originalMaterials != null)
   //     {
   //         Material[] materials = new Material[originalMaterials.Length];
   //         for (int i = 0; i < originalMaterials.Length; i++)
   //         {
   //             materials[i] = new Material(originalMaterials[i]);
   //         }
   //         currentTransparentObj.materials = materials;
   //         currentTransparentObj = null;
   //     }
   // }

    // 调试用：显示检测射线
    void OnDrawGizmos()
    {
        if (carTransform != null)
        {
            Gizmos.color = Color.black;
            Gizmos.DrawLine(transform.position, carTransform.position);
        }
    }
}
