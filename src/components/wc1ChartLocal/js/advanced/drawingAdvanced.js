//-------------------------------------------------------------------------------------------
// Copyright 2012-2017 by ChartIQ, Inc.
// All rights reserved
//-------------------------------------------------------------------------------------------
(function(_exports){
	var CIQ=_exports.CIQ,
	timezoneJS=_exports.timezoneJS;

	/**
	 * Channel drawing tool. Creates a channel within 2 parallel line segments.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.segment}.
	 * @constructor
	 * @name  CIQ.Drawing.channel
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.channel=function(){
		this.name="channel";
		this.dragToDraw=false;
		this.p2=null;
	};

	CIQ.Drawing.channel.ciqInheritsFrom(CIQ.Drawing.segment);

	CIQ.Drawing.channel.prototype.configs=["color","fillColor","lineWidth","pattern"];

	CIQ.Drawing.channel.prototype.move=function(context, tick, value){
		if(!this.penDown) return;

		this.copyConfig();
		if(this.p2===null) this.p1=[tick,value];
		else{
			var y=value-((this.p1[1]-this.p0[1])/(this.p1[0]-this.p0[0]))*(tick-this.p1[0]);
			this.p2=[this.p1[0], y];
		}
		this.render(context);
	};

	CIQ.Drawing.channel.prototype.click=function(context, tick, value){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		this.copyConfig();
		if(!this.penDown){
			this.setPoint(0, tick, value, panel.chart);
			this.penDown=true;
			return false;
		}
		if(this.accidentalClick(tick, value)) {
			this.stx.undo();//abort
			return true;
		}

		if(this.p2!==null){
			this.setPoint(2, this.p2[0], this.p2[1], panel.chart);
			this.penDown=false;
			return true;
		}
		this.setPoint(1, tick, value, panel.chart);
		if(this.p0[0]==this.p1[0]){  // don't allow vertical line
			this.p1=null;
			return false;
		}
		this.p2=[this.p1[0],this.p1[1]];
		return false;
	};

	CIQ.Drawing.channel.prototype.boxIntersection=function(tick, value){
		if(!this.p0 || !this.p1 || !this.p2) return false;
		if(tick>Math.max(this.p0[0], this.p1[0]) || tick<Math.min(this.p0[0], this.p1[0])) return false;

		// http://stackoverflow.com/questions/1560492/how-to-tell-whether-a-point-is-to-the-right-or-left-side-of-a-line
		var s1 = ( (this.p1[0]-this.p0[0])*(value-this.p0[1]) - (this.p1[1]-this.p0[1])*(tick-this.p0[0]) );
		var s2 = ( (this.p2[0]-this.p0[0])*(value-(this.p0[1]+this.p2[1]-this.p1[1])) - (this.p1[1]-this.p0[1])*(tick-this.p0[0]) );
		return (s1*s2<0);
	};

	CIQ.Drawing.channel.prototype.intersected=function(tick, value, box){
		if(!this.p0 || !this.p1 || !this.p2) return null; // in case invalid drawing (such as from panel that no longer exists)
		var pointsToCheck={0:this.p0, 1:this.p1, 2:this.p2};
		for(var pt in pointsToCheck){
			if(this.pointIntersection(pointsToCheck[pt][0], pointsToCheck[pt][1], box)){
				this.highlighted="p"+pt;
				return {
					action: "drag",
					point: "p"+pt
				};	
			}
		}
		if(this.boxIntersection(tick, value)){
			this.highlighted=true;
			// This object will be used for repositioning
			return {
				action: "move",
				p0: CIQ.clone(this.p0),
				p1: CIQ.clone(this.p1),
				p2: CIQ.clone(this.p2),
				tick: tick, // save original tick
				value: value // save original value
			};
		}
		return null;
	};

	CIQ.Drawing.channel.prototype.render=function(context){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
		var y=null;
		if(this.p2) {
			y=this.stx.pixelFromValueAdjusted(panel, this.p2[0], this.p2[1]);
		}

		var width=this.lineWidth;
		var color=this.setLineColor();

		var fillColor=this.fillColor;
		if(this.p2 && fillColor && !CIQ.isTransparent(fillColor) && fillColor!="auto"){
			context.beginPath();
			context.moveTo(x0,y0);
			context.lineTo(x1,y1);
			context.lineTo(x1,y);
			context.lineTo(x0,y0+(y-y1));
			context.closePath();
			context.globalAlpha=0.2;
			context.fillStyle=fillColor;
			context.fill();
			context.globalAlpha=1;
		}

		var parameters={
				pattern: this.pattern,
				lineWidth: width
		};
		if((this.penDown || this.highlighted) && this.pattern=="none") parameters.pattern="dotted";
		this.stx.plotLine(x0, x1, y0, y1, color, "segment", context, panel, parameters);
		if(this.p2) this.stx.plotLine(x0, x1, y0+(y-y1), y, color, "segment", context, panel, parameters);

		if(this.highlighted){
			var p0Fill=this.highlighted=="p0"?true:false;
			var p1Fill=this.highlighted=="p1"?true:false;
			var p2Fill=this.highlighted=="p2"?true:false;
			this.littleCircle(context, x0, y0, p0Fill);
			this.littleCircle(context, x1, y1, p1Fill);
			this.littleCircle(context, x1, y, p2Fill);
		}
	};

	CIQ.Drawing.channel.prototype.reposition=function(context, repositioner, tick, value){
		if(!repositioner) return;
		var panel=this.stx.panels[this.panelName];
		var tickDiff=repositioner.tick-tick;
		var valueDiff=repositioner.value-value;
		if(repositioner.action=="move"){
			this.setPoint(0, repositioner.p0[0]-tickDiff, repositioner.p0[1]-valueDiff, panel.chart);
			this.setPoint(1, repositioner.p1[0]-tickDiff, repositioner.p1[1]-valueDiff, panel.chart);
			this.setPoint(2, repositioner.p2[0]-tickDiff, repositioner.p2[1]-valueDiff, panel.chart);
			this.render(context);
		}else if(repositioner.action=="drag"){
			this[repositioner.point]=[tick, value];
			this.setPoint(0, this.p0[0], this.p0[1], panel.chart);
			this.setPoint(1, this.p1[0], this.p1[1], panel.chart);
			this.setPoint(2, this.p2[0], this.p2[1], panel.chart);
			this.render(context);
		}
	};

	CIQ.Drawing.channel.prototype.adjust=function(){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		this.setPoint(0, this.d0, this.v0, panel.chart);
		this.setPoint(1, this.d1, this.v1, panel.chart);
		this.setPoint(2, this.d1, this.v2, panel.chart);  //not an error, should be d1 here
	};

	/**
	 * Reconstruct a channel
	 * @memberOf CIQ.Drawing.channel
	 * @param  {CIQ.ChartEngine} stx The chart object
	 * @param  {object} [obj] A drawing descriptor
	 * @param {string} [obj.col] The line color
	 * @param {string} [obj.fc] The fill color
	 * @param {string} [obj.pnl] The panel name
	 * @param {string} [obj.ptrn] Pattern for line "solid","dotted","dashed". Defaults to solid.
	 * @param {number} [obj.lw] Line width. Defaults to 1.
	 * @param {number} [obj.v0] Value (price) for the first point
	 * @param {number} [obj.v1] Value (price) for the second point
	 * @param {number} [obj.v2] Value (price) for the second point of the opposing parallel channel line
	 * @param {number} [obj.d0] Date (string form) for the first point
	 * @param {number} [obj.d1] Date (string form) for the second point
	 * @param {number} [obj.tzo0] Offset of UTC from d0 in minutes
	 * @param {number} [obj.tzo1] Offset of UTC from d1 in minutes
	 */
	CIQ.Drawing.channel.prototype.reconstruct=function(stx, obj){
		this.stx=stx;
		this.color=obj.col;
		this.fillColor=obj.fc;
		this.panelName=obj.pnl;
		this.pattern=obj.ptrn;
		this.lineWidth=obj.lw;
		this.d0=obj.d0;
		this.d1=obj.d1;
		this.tzo0=obj.tzo0;
		this.tzo1=obj.tzo1;
		this.v0=obj.v0;
		this.v1=obj.v1;
		this.v2=obj.v2;
		this.adjust();
	};

	CIQ.Drawing.channel.prototype.serialize=function(){
		return {
			name:this.name,
			pnl: this.panelName,
			col:this.color,
			fc:this.fillColor,
			ptrn:this.pattern,
			lw:this.lineWidth,
			d0:this.d0,
			d1:this.d1,
			tzo0: this.tzo0,
			tzo1: this.tzo1,
			v0:this.v0,
			v1:this.v1,
			v2:this.v2
		};
	};

	/**
	 * Andrews' Pitchfork drawing tool. A Pitchfork is defined by three parallel rays.  The center ray is equidistant from the two outer rays.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.channel}.
	 * @constructor
	 * @name  CIQ.Drawing.pitchfork
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.pitchfork=function(){
		this.name="pitchfork";
		this.dragToDraw=false;
		this.p2=null;
	};

	CIQ.Drawing.pitchfork.ciqInheritsFrom(CIQ.Drawing.channel);

	CIQ.Drawing.pitchfork.prototype.configs=["color","lineWidth","pattern"];

	CIQ.Drawing.pitchfork.prototype.move=function(context, tick, value){
		if(!this.penDown) return;

		this.copyConfig();
		if(this.p2===null) this.p1=[tick,value];
		else this.p2=[tick,value];
		this.render(context);
	};

	CIQ.Drawing.pitchfork.prototype.intersected=function(tick, value, box){
		if(!this.p0 || !this.p1 || !this.p2) return null; // in case invalid drawing (such as from panel that no longer exists)
		var pointsToCheck={0:this.p0, 1:this.p1, 2:this.p2};
		for(var pt in pointsToCheck){
			if(this.pointIntersection(pointsToCheck[pt][0], pointsToCheck[pt][1], box)){
				this.highlighted="p"+pt;
				return {
					action: "drag",
					point: "p"+pt
				};	
			}
		}
		var rays=this.rays;
		for(var i=0; i<rays.length; i++){
			if(this.lineIntersection(tick, value, box, i?"ray":"segment", rays[i][0], rays[i][1], true)){
				this.highlighted=true;
				// This object will be used for repositioning
				return {
					action: "move",
					p0: CIQ.clone(this.p0),
					p1: CIQ.clone(this.p1),
					p2: CIQ.clone(this.p2),
					tick: tick, // save original tick
					value: value // save original value
				};
			}
		}
		return null;
	};

	CIQ.Drawing.pitchfork.prototype.render=function(context){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var stx=this.stx;
		var p2=this.p2;
		if(!p2) p2=this.p1;
		var x0=stx.pixelFromTick(this.p0[0], panel.chart);
		var x1=stx.pixelFromTick(this.p1[0], panel.chart);
		var x2=stx.pixelFromTick(p2[0], panel.chart);
		var y0=stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var y1=stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
		var y2=stx.pixelFromValueAdjusted(panel, p2[0], p2[1]);

		var width=this.lineWidth;
		var color=this.setLineColor();

		var parameters={
				pattern: this.pattern,
				lineWidth: width
		};
		var z=50;
		var yp=(2*y0-y1-y2);
		var denom=(2*x0-x1-x2);
		if(denom<0) z*=-1;
		yp*=z/denom;
		this.rays=[[[x1,y1],[x2,y2]], [[x0,y0],[(x1+x2)/2,(y1+y2)/2]]];
		if(!(x1==x2 && y1==y2)){
			this.rays.push([[x1,y1],[x1-z,y1-yp]], [[x2,y2],[x2-z,y2-yp]]);
		}
		for(var i=0;i<this.rays.length;i++){
			var ray=this.rays[i], type=i?"ray":"segment";
			stx.plotLine(ray[0][0], ray[1][0], ray[0][1], ray[1][1], color, type, context, panel, parameters);
		}
		if(this.highlighted){
			var p0Fill=this.highlighted=="p0"?true:false;
			var p1Fill=this.highlighted=="p1"?true:false;
			var p2Fill=this.highlighted=="p2"?true:false;
			this.littleCircle(context, x0, y0, p0Fill);
			this.littleCircle(context, x1, y1, p1Fill);
			this.littleCircle(context, x2, y2, p2Fill);
		}

	};

	CIQ.Drawing.pitchfork.prototype.adjust=function(){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		this.setPoint(0, this.d0, this.v0, panel.chart);
		this.setPoint(1, this.d1, this.v1, panel.chart);
		this.setPoint(2, this.d2, this.v2, panel.chart);
	};

	/**
	 * Reconstruct a pitchfork
	 * @memberOf CIQ.Drawing.pitchfork
	 * @param  {CIQ.ChartEngine} stx The chart object
	 * @param  {object} [obj] A drawing descriptor
	 * @param {string} [obj.col] The line color
	 * @param {string} [obj.pnl] The panel name
	 * @param {string} [obj.ptrn] Pattern for line "solid","dotted","dashed". Defaults to solid.
	 * @param {number} [obj.lw] Line width. Defaults to 1.
	 * @param {number} [obj.v0] Value (price) for the first point
	 * @param {number} [obj.v1] Value (price) for the second point
	 * @param {number} [obj.v2] Value (price) for the third point
	 * @param {number} [obj.d0] Date (string form) for the first point
	 * @param {number} [obj.d1] Date (string form) for the second point
	 * @param {number} [obj.d2] Date (string form) for the third point
	 * @param {number} [obj.tzo0] Offset of UTC from d0 in minutes
	 * @param {number} [obj.tzo1] Offset of UTC from d1 in minutes
	 * @param {number} [obj.tzo2] Offset of UTC from d2 in minutes
	 */
	CIQ.Drawing.pitchfork.prototype.reconstruct=function(stx, obj){
		this.stx=stx;
		this.color=obj.col;
		this.panelName=obj.pnl;
		this.pattern=obj.ptrn;
		this.lineWidth=obj.lw;
		this.d0=obj.d0;
		this.d1=obj.d1;
		this.d2=obj.d2;
		this.tzo0=obj.tzo0;
		this.tzo1=obj.tzo1;
		this.tzo2=obj.tzo2;
		this.v0=obj.v0;
		this.v1=obj.v1;
		this.v2=obj.v2;
		this.adjust();
	};

	CIQ.Drawing.pitchfork.prototype.serialize=function(){
		return {
			name:this.name,
			pnl: this.panelName,
			col:this.color,
			ptrn:this.pattern,
			lw:this.lineWidth,
			d0:this.d0,
			d1:this.d1,
			d2:this.d2,
			tzo0: this.tzo0,
			tzo1: this.tzo1,
			tzo2: this.tzo2,
			v0:this.v0,
			v1:this.v1,
			v2:this.v2
		};
	};


	/**
	 * Gartley drawing tool. Creates a series of four connected line segments, each one completed with a user click.
	 * Will adhere to Gartley requirements vis-a-vis fibonacci levels etc..
	 *
	 * It inherits its properties from {@link CIQ.Drawing.continuous}.
	 * @constructor
	 * @name  CIQ.Drawing.gartley
	 * @version ChartIQ Advanced Package
	 * @since 04-2015-15
	 */
	CIQ.Drawing.gartley=function(){
		this.name="gartley";
		this.dragToDraw=false;
		this.maxSegments=4;
		this.shape=null;
		this.points=[];
	};

	CIQ.Drawing.gartley.ciqInheritsFrom(CIQ.Drawing.continuous);

	CIQ.Drawing.gartley.prototype.check=function(first, second){
		if(!second) return true;
		if(first[0]>=second[0] || first[1]==second[1]) return false;
		if(this.segment==1){
			if(first[1]<second[1]) this.shape="M"; else this.shape="W";
		}else if(this.segment==2){
			if(this.shape=="M" && first[1]<second[1]) return false;
			else if(this.shape=="W" && first[1]>second[1]) return false;
			else if((second[1]-first[1])/(this.points[0][1]-first[1])<0.618) return false;
			else if((second[1]-first[1])/(this.points[0][1]-first[1])>=0.786) return false;
		}else if(this.segment==3){
			if(this.shape=="M" && first[1]>second[1]) return false;
			else if(this.shape=="W" && first[1]<second[1]) return false;
			else if((second[1]-first[1])/(this.points[1][1]-first[1])<0.618) return false;
			else if((second[1]-first[1])/(this.points[1][1]-first[1])>=0.786) return false;
		}else if(this.segment==4){
			if(this.shape=="M" && (first[1]<second[1] || second[1]<this.points[0][1])) return false;
			else if(this.shape=="W" && (first[1]>second[1] || second[1]>this.points[0][1])) return false;
			else if((this.points[1][1]-second[1])/(this.points[1][1]-this.points[2][1])<1.27) return false;
			else if((this.points[1][1]-second[1])/(this.points[1][1]-this.points[2][1])>=1.618) return false;
		}
		return true;
	};

	CIQ.Drawing.gartley.prototype.click=function(context, tick, value){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		this.copyConfig();
		if(!this.penDown){
			this.setPoint(0, tick, value, panel.chart);
			this.pts=[];
			this.penDown=true;
			this.segment=1;
			return false;
		}
		if(this.accidentalClick(tick, value)) {
			this.penDown=true;
			return false;
		}
		if(this.check(this.p0,this.p1)){
			if(this.segment==1) this.points.push(this.p0);
			this.points.push(this.p1);
			this.drawDropZones=true;
			this.setPoint(1, tick, value, panel.chart);
			this.segment++;

			if(this.segment>this.maxSegments) {
				this.setPoint(0, this.points[0][0], this.points[0][1], panel.chart);
				this.penDown=false;
				return true;
			}
			this.pts.push(this.d1,this.tzo1,this.v1);
			this.setPoint(0, tick, value, panel.chart);  // reset initial point for next segment, copy by value
		}
		return false;
	};

	CIQ.Drawing.gartley.prototype.render=function(context){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);

		if(this.segment==2){
			this.drawDropZone(context, 0.618*this.points[0][1]+0.382*this.p0[1], 0.786*this.points[0][1]+0.214*this.p0[1], this.p0[0]);
		}else if(this.segment==3){
			this.drawDropZone(context, 0.618*this.points[1][1]+0.382*this.p0[1], 0.786*this.points[1][1]+0.214*this.p0[1], this.p0[0]);
		}else if(this.segment==4){
			var bound=1.618*this.points[2][1]-0.618*this.points[1][1];
			if(this.shape=="M") bound=Math.max(bound,this.points[0][1]);
			else bound=Math.min(bound,this.points[0][1]);
			this.drawDropZone(context, bound, 1.27*this.points[2][1]-0.27*this.points[1][1], this.p0[0]);
		}

		var width=this.lineWidth;
		var color=this.setLineColor();

		var parameters={
				pattern: this.pattern,
				lineWidth: width
		};
		if((this.penDown || this.highlighted) && this.pattern=="none") parameters.pattern="dotted";
		if(this.segment<=this.maxSegments)
			this.stx.plotLine(x0, x1, y0, y1, color, this.name, context, panel, parameters);

		var fillColor=this.fillColor;
		var coords=[];
		if(this.points.length){
			context.beginPath();
			for(var fp=1;fp<this.points.length && fp<=4;fp++){
				var xx0=this.stx.pixelFromTick(this.points[fp-1][0], panel.chart);
				var xx1=this.stx.pixelFromTick(this.points[fp][0], panel.chart);
				var yy0=this.stx.pixelFromValueAdjusted(panel, this.points[fp-1][0], this.points[fp-1][1]);
				var yy1=this.stx.pixelFromValueAdjusted(panel, this.points[fp][0], this.points[fp][1]);
				if(fp==1) coords.push(xx0,yy0);
				coords.push(xx1,yy1);
				this.stx.plotLine(xx0, xx1, yy0, yy1, color, this.name, context, panel, parameters);
			}
			if(this.points.length==2 || this.points.length==4){
				coords.push(x1,y1);
			}
			if(this.points[2]){
				coords.push(this.stx.pixelFromTick(this.points[2][0], panel.chart),
								this.stx.pixelFromValueAdjusted(panel, this.points[2][0], this.points[2][1]));
			}
			if(fillColor && fillColor!="auto" && !CIQ.isTransparent(fillColor)){
				for(var c=0;c<coords.length;c+=2){
					if(c===0) context.moveTo(coords[0],coords[1]);
					context.lineTo(coords[c],coords[c+1]);
				}
				context.fillStyle=fillColor;
				context.globalAlpha=0.2;
				context.closePath();
				context.fill();
				context.globalAlpha=1;
			}
		}

		/*if(this.highlighted){
			var p0Fill=this.highlighted=="p0"?true:false;
			var p1Fill=this.highlighted=="p1"?true:false;
			this.littleCircle(context, x0, y0, p0Fill);
			this.littleCircle(context, x1, y1, p1Fill);
		}*/

	};

	CIQ.Drawing.gartley.prototype.lineIntersection=function(tick, value, box, type){
		var points=this.points, panel=this.stx.panels[this.panelName];
		if(points.length!=this.maxSegments+1 || !panel) return false;
		for(var pt=0;pt<points.length-1;pt++){
			if(CIQ.Drawing.BaseTwoPoint.prototype.lineIntersection.call(this, tick, value, box, "segment", points[pt], points[pt+1])) return true;
		}
		return false;
	};

	CIQ.Drawing.gartley.prototype.boxIntersection=function(tick, value){
		if(!this.p0 || !this.p1) return false;
		if(tick>Math.max(this.p0[0], this.p1[0]) || tick<Math.min(this.p0[0], this.p1[0])) return false;
		var lowPoint=Math.min(this.p0[1],this.p1[1]);
		var highPoint=Math.max(this.p0[1],this.p1[1]);
		for(var pt=0;pt<this.points.length;pt++){
			lowPoint=Math.min(lowPoint,this.points[pt][1]);
			highPoint=Math.max(highPoint,this.points[pt][1]);
		}
		if(value>highPoint || value<lowPoint) return false;
		return true;
	};

	CIQ.Drawing.gartley.prototype.reposition=function(context, repositioner, tick, value){
		if(!repositioner) return;
		var panel=this.stx.panels[this.panelName];
		var tickDiff=repositioner.tick-tick;
		repositioner.tick=tick;
		var valueDiff=repositioner.value-value;
		repositioner.value=value;
		if(repositioner.action=="move"){
			this.pts=[];
			for(var pt=0;pt<this.points.length;pt++){
				this.points[pt][0]-=tickDiff;
				this.points[pt][1]-=valueDiff;
				this.setPoint(1, this.points[pt][0], this.points[pt][1], panel.chart);
				if(pt && pt<this.points.length-1) this.pts.push(this.d1,this.tzo1,this.v1);
				this.points[pt]=this.p1;
			}
			this.setPoint(0, this.points[0][0], this.points[0][1], panel.chart);
			this.render(context);
		/*}else if(repositioner.action=="drag"){
			this[repositioner.point]=[tick, value];
			this.setPoint(0, this.p0[0], this.p0[1], panel.chart);
			this.setPoint(1, this.p1[0], this.p1[1], panel.chart);
			this.render(context);*/
		}
	};

	CIQ.Drawing.gartley.prototype.configs=["color","fillColor","lineWidth","pattern"];

	CIQ.Drawing.gartley.prototype.drawDropZone=function(context, hBound1, hBound2, leftBound){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var y0=this.stx.pixelFromPrice(hBound1, panel);
		var y1=this.stx.pixelFromPrice(hBound2, panel)-y0;
		var x0=this.stx.pixelFromTick(leftBound, panel.chart);
		var x1=panel.width-x0;
		context.fillStyle="#008000";
		context.globalAlpha=0.2;
		context.fillRect(x0, y0, x1, y1);
		context.globalAlpha=1;
	};

	CIQ.Drawing.gartley.prototype.adjust=function(){
		// If the drawing's panel doesn't exist then we'll check to see
		// whether the panel has been added. If not then there's no way to adjust
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		this.reconstructPoints();

		this.setPoint(0, this.d0, this.v0, panel.chart);
		this.points.unshift(this.p0);

		this.setPoint(1, this.d1, this.v1, panel.chart);
		this.points.push(this.p1);
	};

	CIQ.Drawing.gartley.prototype.reconstructPoints=function(){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		this.points=[];
		for(var a=0;a<this.pts.length;a+=3){
			var d=CIQ.strToDateTime(this.pts[a]);
			d.setMinutes(d.getMinutes()+Number(this.pts[a+1])-d.getTimezoneOffset());
			this.points.push([this.stx.tickFromDate(CIQ.yyyymmddhhmmssmmm(d),panel.chart),this.pts[a+2]]);
		}
	};

	/**
	 * Reconstruct a gartley
	 * @memberOf CIQ.Drawing.gartley
	 * @param  {CIQ.ChartEngine} stx The chart object
	 * @param  {object} [obj] A drawing descriptor
	 * @param {string} [obj.col] The line color
	 * @param {string} [obj.fc] The fill color
	 * @param {string} [obj.pnl] The panel name
	 * @param {string} [obj.ptrn] Pattern for line "solid","dotted","dashed". Defaults to solid.
	 * @param {number} [obj.lw] Line width. Defaults to 1.
	 * @param {number} [obj.v0] Value (price) for the first point
	 * @param {number} [obj.v1] Value (price) for the last point
	 * @param {number} [obj.d0] Date (string form) for the first point
	 * @param {number} [obj.d1] Date (string form) for the last point
	 * @param {number} [obj.tzo0] Offset of UTC from d0 in minutes
	 * @param {number} [obj.tzo1] Offset of UTC from d1 in minutes
	 * @param {number} [obj.pts] a serialized list of dates,offsets,values for the 3 intermediate points of the gartley (should be 9 items in list)
	 */
	CIQ.Drawing.gartley.prototype.reconstruct=function(stx, obj){
		this.stx=stx;
		this.color=obj.col;
		this.fillColor=obj.fc;
		this.panelName=obj.pnl;
		this.pattern=obj.ptrn;
		this.lineWidth=obj.lw;
		this.d0=obj.d0;
		this.d1=obj.d1;
		this.tzo0=obj.tzo0;
		this.tzo1=obj.tzo1;
		this.v0=obj.v0;
		this.v1=obj.v1;
		this.pts=obj.pts.split(",");
		this.adjust();
	};

	CIQ.Drawing.gartley.prototype.serialize=function(){
		return {
			name:this.name,
			pnl: this.panelName,
			col:this.color,
			fc:this.fillColor,
			ptrn:this.pattern,
			lw:this.lineWidth,
			d0:this.d0,
			d1:this.d1,
			tzo0: this.tzo0,
			tzo1: this.tzo1,
			v0:this.v0,
			v1:this.v1,
			pts:this.pts.join(",")
		};
	};

	/**
	 * Freeform drawing tool. Set splineTension to a value from 0 to 1 (default .3). This is a dragToDraw function
	 * and automatically disables the crosshairs while enabled.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.segment}.
	 * @constructor
	 * @name  CIQ.Drawing.freeform
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.freeform=function(){
		this.name="freeform";
		this.splineTension=0.3;  //set to -1 to not use splines at all
		this.dragToDraw=true;
	};

	CIQ.Drawing.freeform.ciqInheritsFrom(CIQ.Drawing.segment);

	CIQ.Drawing.freeform.prototype.measure=function(){};

	CIQ.Drawing.freeform.prototype.intersected=function(tick, value, box){
		if(tick>this.hiX || tick<this.lowX) return null;
		if(value>this.hiY || value<this.lowY) return null;
		this.highlighted=true;
		// This object will be used for repositioning
		return {
			action: "move",
			p0: CIQ.clone(this.p0),
			tick: tick, // save original tick
			value: value // save original value
		};
	};

	CIQ.Drawing.freeform.prototype.reposition=function(context, repositioner, tick, value){
		if(!repositioner) return;
		var panel=this.stx.panels[this.panelName];
		var tickDiff=repositioner.tick-tick;
		var valueDiff=repositioner.value-value;
		if(repositioner.action=="move"){
			this.setPoint(0, repositioner.p0[0]-tickDiff, repositioner.p0[1]-valueDiff, panel.chart);
			this.adjust();
			this.render(context);
		}
	};

	CIQ.Drawing.freeform.prototype.click=function(context, tick, value){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;

		if(this.penDown===false){
			this.copyConfig();
			this.startX=Math.round(this.stx.resolveX(this.stx.pixelFromTick(tick, panel.chart)));
			this.startY=Math.round(this.stx.resolveY(this.stx.pixelFromValueAdjusted(panel, tick, value)));
			var d=this.stx.dateFromTick(tick, panel.chart, true);
			this.d0=CIQ.yyyymmddhhmmssmmm(d);
			this.tzo0=d.getTimezoneOffset();
			this.v0=value;
			this.p0=[CIQ.ChartEngine.crosshairX-this.startX, CIQ.ChartEngine.crosshairY-this.startY];
			this.nodes=[this.p0[0],this.p0[1]];
			this.pNodes=[this.p0];
			this.candleWidth=this.stx.layout.candleWidth;
			this.multiplier=panel.yAxis.multiplier;
			this.interval=this.stx.layout.interval;
			this.periodicity=this.stx.layout.periodicity;
			this.tempSplineTension=this.splineTension;
			this.splineTension=-1;
			document.body.style.cursor="pointer";
			this.penDown=true;
			return false;
		}
		this.penDown=false;
		this.splineTension=this.tempSplineTension;
		document.body.style.cursor="auto";
		//this.adjust(); //moved to drawingClick - Gus
		return true;
	};

	CIQ.Drawing.freeform.prototype.move=function(context, tick, value){
		if(!this.penDown) return;

		var panel=this.stx.panels[this.panelName];
		var d1=this.stx.dateFromTick(tick, panel.chart, true);
		this.d1=CIQ.yyyymmddhhmmssmmm(d1);
		this.tzo1=d1.getTimezoneOffset();
		this.v1=value;
		this.p1=[CIQ.ChartEngine.crosshairX-this.startX,CIQ.ChartEngine.crosshairY-this.startY];

		if(this.pNodes.length>2){
			if( this.p1[0]==this.pNodes[this.pNodes.length-2][0] &&
				this.p1[0]==this.pNodes[this.pNodes.length-1][0]){
				this.pNodes.length--;
				this.nodes.length-=2;
			}else if(this.p1[1]==this.pNodes[this.pNodes.length-2][1] &&
					 this.p1[1]==this.pNodes[this.pNodes.length-1][1]){
				this.pNodes.length--;
				this.nodes.length-=2;
			}
		}

		this.nodes.push(this.p1[0],this.p1[1]);
		this.pNodes.push(this.p1);

		this.render(context);
		return false;
	};

	//TODO: make more exact, and relocate this to somewhere useful
	CIQ.Drawing.freeform.prototype.intervalRatio=function(oldInterval,newInterval,oldPeriodicity,newPeriodicity,startDate,symbol){
		//approximating functions
		function weeksInMonth(startDate,symbol){return 5;}
		function daysInWeek(startDate,symbol){return 5;}
		function daysInMonth(startDate,symbol){return 30;}
		function minPerDay(startDate,symbol){
			if(CIQ.Market.Symbology.isForexSymbol(symbol)) return 1440;
			return 390;
		}
		//1,3,5,10,15,30,"day","week","month"
		var returnValue=0;
		if(oldInterval==newInterval) returnValue=1;
		else if(!isNaN(oldInterval) && !isNaN(newInterval)) returnValue=oldInterval/newInterval;  //two intraday intervals
		else if(isNaN(oldInterval)){  //was daily
			if(oldInterval=="month"){
				if(newInterval=="week") returnValue=weeksInMonth(startDate,symbol);
				else if(newInterval=="day") returnValue=daysInMonth(startDate,symbol);
				else if(!isNaN(newInterval)) returnValue=daysInMonth(startDate,symbol)*minPerDay(startDate,symbol)/newInterval;
			}else if(oldInterval=="week"){
				if(newInterval=="month") returnValue=1/weeksInMonth(startDate,symbol);
				if(newInterval=="day") returnValue=daysInWeek(startDate,symbol);
				else if(!isNaN(newInterval)) returnValue=daysInWeek(startDate,symbol)*minPerDay(startDate,symbol)/newInterval;
			}else if(oldInterval=="day"){
				if(newInterval=="week") returnValue=1/daysInWeek(startDate,symbol);
				else if(newInterval=="month") returnValue=1/daysInMonth(startDate,symbol);
				else if(!isNaN(newInterval)) returnValue=minPerDay(startDate,symbol)/newInterval;
			}
		}else if(!isNaN(oldInterval)){  //switching from intraday to daily
			if(newInterval=="month") returnValue=oldInterval/(daysInMonth(startDate,symbol)*minPerDay(startDate,symbol));
			else if(newInterval=="week") returnValue=oldInterval/(daysInWeek(startDate,symbol)*minPerDay(startDate,symbol));
			else if(newInterval=="day") returnValue=oldInterval/minPerDay(startDate,symbol);
		}
		returnValue*=oldPeriodicity/newPeriodicity;
		return returnValue;
	};

	CIQ.Drawing.freeform.prototype.render=function(context){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;

		var intvl=this.intervalRatio(this.interval,this.stx.layout.interval,this.periodicity,this.stx.layout.periodicity,this.d0,panel.chart.symbol);
		if(intvl===0) return;

		var cwr=this.stx.layout.candleWidth/this.candleWidth;
		var mlt=panel.yAxis.multiplier/this.multiplier;
		this.setPoint(0, this.d0, this.v0, panel.chart);
		var spx=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var spy=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var arrPoints=[];

		var width=this.lineWidth;
		var color=this.setLineColor();

		var parameters={
			pattern: this.pattern,
			lineWidth: width
		};

		for(var n=0;n<this.pNodes.length;n++){
			var x0=intvl*cwr*(this.pNodes[n][0])+spx;
			var y0=mlt*(this.pNodes[n][1])+spy;
			arrPoints.push(x0,y0);
		}

		if(!arrPoints.length) return;
		if(this.splineTension<0){
			this.stx.connectTheDots(arrPoints, color, this.name, context, panel, parameters);
		}else{
			this.stx.plotSpline(arrPoints,this.splineTension,color,this.name,context,true,parameters);
		}
	};

	CIQ.Drawing.freeform.prototype.adjust=function(){
		// If the drawing's panel doesn't exist then we'll check to see
		// whether the panel has been added. If not then there's no way to adjust
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;

		var p0=[this.nodes[0], this.nodes[1]];
		this.pNodes=[p0];
		this.lowX=this.nodes[0];
		this.hiX=this.nodes[0];
		this.lowY=this.nodes[1];
		this.hiY=this.nodes[1];

		for(var n=2;n<this.nodes.length;n+=2){
			var p1=[this.nodes[n], this.nodes[n+1]];
			this.pNodes.push(p1);
			this.lowX=Math.min(this.lowX,p1[0]);
			this.hiX=Math.max(this.hiX,p1[0]);
			this.lowY=Math.max(this.lowY,p1[1]);  //reversed because price axis goes bottom to top
			this.hiY=Math.min(this.hiY,p1[1]);
		}

		var intvl=this.intervalRatio(this.interval,this.stx.layout.interval,this.periodicity,this.stx.layout.periodicity,this.d0,panel.chart.symbol);
		if(intvl===0) return;

		var cwr=this.stx.layout.candleWidth/this.candleWidth;
		var mlt=panel.yAxis.multiplier/this.multiplier;
		this.setPoint(0, this.d0, this.v0, panel.chart);
		var spx=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var spy=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);

		this.lowX=this.stx.tickFromPixel(Math.floor(intvl*cwr*(this.lowX))+spx,panel.chart);
		this.hiX=this.stx.tickFromPixel(Math.ceil(intvl*cwr*(this.hiX))+spx,panel.chart);
		this.lowY=this.stx.valueFromPixel(Math.floor(mlt*(this.lowY))+spy,panel);
		this.hiY=this.stx.valueFromPixel(Math.ceil(mlt*(this.hiY))+spy,panel);

	};

	CIQ.Drawing.freeform.prototype.serialize=function(){
		return {
			name:this.name,
			pnl: this.panelName,
			col:this.color,
			ptrn:this.pattern,
			lw:this.lineWidth,
			cw:Number(this.candleWidth.toFixed(4)),
			mlt:Number(this.multiplier.toFixed(4)),
			d0:this.d0,
			tzo0:this.tzo0,
			v0:this.v0,
			inter:this.interval,
			pd:this.periodicity,
			nodes:this.nodes
		};
	};

	/**
	 * Reconstruct a freeform drawing. It is not recommended to do this programmatically.
	 * @param  {CIQ.ChartEngine} stx The chart object
	 * @param  {object} [obj] A drawing descriptor
	 * @param {string} [obj.col] The line color
	 * @param {string} [obj.pnl] The panel name
	 * @param {string} [obj.ptrn] Pattern for line "solid","dotted","dashed". Defaults to solid.
	 * @param {number} [obj.lw] Line width. Defaults to 1.
	 * @param {number} [obj.cw] Candle width from original drawing
	 * @param {number} [obj.mlt] Y-axis multiplier from original drawing
	 * @param {number} [obj.v0] Value (price) for the first point
	 * @param {number} [obj.d0] Date (string form) for the first point
	 * @param {number} [obj.int] Interval from original drawing
	 * @param {number} [obj.pd] Periodicity from original drawing
	 * @param {number} [obj.tzo0] Offset of UTC from d0 in minutes
	 * @param {array} [obj.nodes] An array of nodes in form [x0a,x0b,y0a,y0b, x1a, x1b, y1a, y1b, ....]
	 * @memberOf CIQ.Drawing.freeform
	 */
	CIQ.Drawing.freeform.prototype.reconstruct=function(stx, obj){
		this.stx=stx;
		this.color=obj.col;
		this.panelName=obj.pnl;
		this.pattern=obj.ptrn;
		this.lineWidth=obj.lw;
		this.candleWidth=obj.cw;
		this.multiplier=obj.mlt;
		this.d0=obj.d0;
		this.tzo0=obj.tzo0;
		this.v0=obj.v0;
		this.interval=obj.inter;
		this.periodicity=obj.pd;
		this.nodes=obj.nodes;
		this.adjust();
	};


	/**
	 * Callout drawing tool.  This is like an annotation except it draws a stem and offers a background color and line style.
	 *
	 * @constructor
	 * @name  CIQ.Drawing.callout
	 * @since 2015-11-1
	 * @version ChartIQ Advanced Package
	 * @see {@link CIQ.Drawing.annotation}
	 */
	CIQ.Drawing.callout=function(){
		this.name="callout";
		this.arr=[];
		this.w=0;
		this.h=0;
		this.padding=4;
		this.text="";
		this.ta=null;
		this.fontSize=0;
		this.font={};
		this.stemEntry="";
		this.defaultWidth=50;
		this.defaultHeight=10;
		//this.dragToDraw=true;
	};

	CIQ.Drawing.callout.ciqInheritsFrom(CIQ.Drawing.annotation);

	CIQ.Drawing.callout.prototype.configs=["color","fillColor","lineWidth","pattern","font"];

	CIQ.Drawing.callout.prototype.copyConfig=function(withPreferences){
		CIQ.Drawing.copyConfig(this,withPreferences);
		this.borderColor=this.color;
	};

	CIQ.Drawing.callout.prototype.move=function(context, tick, value){
		if(!this.penDown) return;

		this.copyConfig();
		this.p0=[tick,value];
		this.render(context);
	};

	CIQ.Drawing.callout.prototype.onChange=function(e){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var textarea=e.target;
		this.w=textarea.clientWidth;
		this.h=textarea.clientHeight;
		//textarea.style.left=(this.stx.pixelFromTick(this.p0[0])-this.w/2) + "px";
		//textarea.style.top=(this.stx.pixelFromPrice(this.p0[1],panel)-this.h/2) + "px";
		var context=this.context || this.stx.chart.tempCanvas.context;
		CIQ.clearCanvas(context.canvas, this.stx);
		this.render(context);
		this.edit(context);
	};

	CIQ.Drawing.callout.prototype.render=function(context){
		this.context=context; // remember last context
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		if(isNaN(y0)) return;

		context.font=this.fontString;
		context.textBaseline="top";
		var x=x0;
		var y=y0;
		var w=this.w/2;
		var h=this.h/2;
		if(this.penDown){
			w=this.defaultWidth; h=this.defaultHeight;
			if(!h) h=this.fontSize;
		}
		var lineWidth=this.lineWidth;
		if(!lineWidth) lineWidth=1.1;
		var color=this.color;
		if(color=="auto" || CIQ.isTransparent(color)) color=this.stx.defaultColor;
		var borderColor=this.borderColor;
		if(borderColor=="auto" || CIQ.isTransparent(borderColor)) borderColor=this.stx.defaultColor;
		if(this.highlighted) borderColor=this.stx.getCanvasColor("stx_highlight_vector");
		var sx0, sx1, sy0, sy1;
		var r=Math.min(Math.min(w,h)/2,8);
		if(this.stem){
			if(this.stem.t){	// absolute positioning of stem
				sx0=this.stx.pixelFromTick(this.stem.t);	// bottom of stem
				sy0=this.stx.pixelFromValueAdjusted(panel, this.stem.t, this.stem.v);
			}else if(this.stem.x){	// stem with relative offset positioning
				sx0=x;
				sy0=y;
				x+=this.stem.x;
				y+=this.stem.y;
			}

			var state="";
			if(sx0>=x+w) {sx1=x+w;state="r";}	// right of text
			else if(sx0>x-w && sx0<x+w) {sx1=x;state="c";}	// center of text
			else if(sx0<=x-w) {sx1=x-w;state="l";}	// left of text

			if(sy0>=y+h) {sy1=y+h;state+="b";}	// bottom of text
			else if(sy0>y-h && sy0<y+h) {sy1=y;state+="m";}	// middle of text
			else if(sy0<=y-h) {sy1=y-h;state+="t";}	// top of text

			this.stemEntry=state;

			if(state!="cm"){  // make sure stem does not originate underneath the annotation
				sx0=Math.round(sx0);
				sx1=Math.round(sx1);
				sy0=Math.round(sy0);
				sy1=Math.round(sy1);
			}
		}
		if(this.highlighted){
			this.stx.canvasColor("stx_annotation_highlight_bg", context);
		}else{
			if(this.fillColor){
				context.fillStyle=this.fillColor;
				context.globalAlpha=0.4;
			}else if(this.stem){	// If there's a stem then use the container color otherwise the stem will show through
				context.fillStyle=this.stx.containerColor;
			}
		}
		context.strokeStyle=borderColor;
		if(context.setLineDash){
			context.setLineDash(CIQ.borderPatternToArray(lineWidth,this.pattern));
			context.lineDashOffset=0;  //start point in array
		}

		if(borderColor){
			context.beginPath();
			context.lineWidth=lineWidth;
			context.moveTo(x+w-r,y-h);
			if(this.stemEntry!="rt"){
				context.quadraticCurveTo(x+w, y-h, x+w, y-h+r);//top right
			}else{
				context.lineTo(sx0,sy0);
				context.lineTo(x+w, y-h+r);
			}
			context.lineTo(x+w,y-r/2);
			if(this.stemEntry=="rm") context.lineTo(sx0,sy0);
			context.lineTo(x+w,y+r/2);
			context.lineTo(x+w,y+h-r);
			if(this.stemEntry!="rb"){
				context.quadraticCurveTo(x+w, y+h, x+w-r, y+h);//bottom right
			}else{
				context.lineTo(sx0,sy0);
				context.lineTo(x+w-r, y+h);
			}
			context.lineTo(x+r/2,y+h);
			if(this.stemEntry=="cb") context.lineTo(sx0,sy0);
			context.lineTo(x-r/2,y+h);
			context.lineTo(x-w+r,y+h);
			if(this.stemEntry!="lb"){
				context.quadraticCurveTo(x-w, y+h, x-w, y+h-r);//bottom left
			}else{
				context.lineTo(sx0,sy0);
				context.lineTo(x-w, y+h-r);
			}
			context.lineTo(x-w,y+r/2);
			if(this.stemEntry=="lm") context.lineTo(sx0,sy0);
			context.lineTo(x-w,y-r/2);
			context.lineTo(x-w,y-h+r);
			if(this.stemEntry!="lt"){
				context.quadraticCurveTo(x-w, y-h, x-w+r, y-h);//top left
			}else{
				context.lineTo(sx0,sy0);
				context.lineTo(x-w+r, y-h);
			}
			context.lineTo(x-r/2,y-h);
			if(this.stemEntry=="ct") context.lineTo(sx0,sy0);
			context.lineTo(x+r/2,y-h);
			context.lineTo(x+w-r,y-h);
			context.fill();
			context.globalAlpha=1;
			if(this.pattern!="none") context.stroke();
		}
		if(this.highlighted){
			this.stx.canvasColor("stx_annotation_highlight", context);
		}else{
			context.fillStyle=color;
		}
		y+=this.padding;
		for(var i=0;i<this.arr.length;i++){
			context.fillText(this.arr[i], x-w+this.padding, y-h);
			y+=this.fontSize;
		}
		context.textBaseline="alphabetic";

		if(this.highlighted && !this.noHandles){
			var p0Fill=this.highlighted=="p0"?true:false;
			this.littleCircle(context, sx0, sy0, p0Fill);
		}
		/*if(this.penDown){
			context.globalAlpha=0.2;
			context.fillText("[Your text here]", x-w+this.padding, y-h);
			context.globalAlpha=1;
		}*/
	};

	CIQ.Drawing.callout.prototype.click=function(context, tick, value){
		//don't allow user to add callout on the axis.
		if(this.stx.overXAxis || this.stx.overYAxis) return;
		var panel=this.stx.panels[this.panelName];
		this.copyConfig();
		//this.getFontString();
		this.setPoint(0, tick, value, panel.chart);
		if(!this.penDown){
			this.stem={
				"d":this.d0,
				"v":this.v0
			};
			this.penDown=true;
			this.adjust();
			return false;
		}
		this.adjust();
		this.edit(context);
		this.penDown=false;
		return false;

	};

	CIQ.Drawing.callout.prototype.reposition=function(context, repositioner, tick, value){
		if(!repositioner) return;
		var panel=this.stx.panels[this.panelName];
		var tickDiff=repositioner.tick-tick;
		var valueDiff=repositioner.value-value;
		if(repositioner.stem){
			if(repositioner.action=="drag"){
				this.stem={
					"d":this.stx.dateFromTick(tick, panel.chart, true),
					"v":value
				};
			}else if(repositioner.action=="move"){
				this.setPoint(0, repositioner.p0[0]-tickDiff, repositioner.p0[1]-valueDiff, panel.chart);
				this.stem={
					"d":this.stx.dateFromTick(this.stx.tickFromDate(repositioner.stem.d, panel.chart)-tickDiff),
					"v":repositioner.stem.v-valueDiff
				};
			}
			this.adjust();
		}else{
			this.setPoint(0, repositioner.p0[0]-tickDiff, repositioner.p0[1]-valueDiff, panel.chart);
		}
		this.render(context);
	};

	CIQ.Drawing.callout.prototype.lineIntersection=function(tick, value, box, type){
		var panel=this.stx.panels[this.panelName];
		var stem=this.stem, p0=this.p0, stx=this.stx;
		if(!p0 || !stem || !panel) return false;
		var stemTick=stem.t || this.stx.tickFromDate(stem.d, panel.chart);
		var pObj={x0:p0[0], x1:stemTick, y0:p0[1], y1:stem.v};
		var pixelPoint=CIQ.convertBoxToPixels(stx,this.panelName,pObj);
		var x0=pixelPoint.x0;
		var y0=pixelPoint.y0;
		var x1=pixelPoint.x1;
		var y1=pixelPoint.y1;
		if(typeof(this.stemEntry)=="string"){
			if(this.stemEntry.indexOf("l")>-1) x0-=this.w/2;
			else if(this.stemEntry.indexOf("r")>-1) x0+=this.w/2;
			if(this.stemEntry.indexOf("t")>-1) y0-=this.h/2;
			else if(this.stemEntry.indexOf("b")>-1) y0+=this.h/2;
		}
		var pixelBox=CIQ.convertBoxToPixels(stx,this.panelName,box);
		return CIQ.boxIntersects(pixelBox.x0, pixelBox.y0, pixelBox.x1, pixelBox.y1, x0, y0, x1, y1, type);
	};

	CIQ.Drawing.callout.prototype.intersected=function(tick, value, box){
		var panel=this.stx.panels[this.panelName];
		if(!this.p0) return null; // in case invalid drawing (such as from panel that no longer exists)
		if(this.pointIntersection(this.stem.t, this.stem.v, box)){
			this.highlighted="p0";
			return {
				action: "drag",
				stem: true
			};
		}
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart)-this.w/2;
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1])-this.h/2;
		var x1=x0+this.w;
		var y1=y0+this.h;
		if(this.stem && this.stem.x){
			x0+=this.stem.x;
			x1+=this.stem.x;
			y0+=this.stem.y;
			y1+=this.stem.y;
		}
		var x=this.stx.pixelFromTick(tick, panel.chart);
		var y=this.stx.pixelFromValueAdjusted(panel, tick, value);
		if(x>=x0 && x<=x1 && y>=y0 && y<=y1) {
			this.highlighted=true;
			return {
				p0: CIQ.clone(this.p0),
				tick: tick,
				value: value
			};
		}
		var isIntersected=this.lineIntersection(tick, value, box, "segment");
		if(isIntersected){
			this.highlighted=true;
			// This object will be used for repositioning
			return {
				action: "move",
				stem: CIQ.clone(this.stem),
				p0: CIQ.clone(this.p0),
				tick: tick, // save original tick
				value: value // save original value
			};
		}
		return null;
	};

	/**
	 * Fibonacci projection drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.fibonacci}
	 * @constructor
	 * @name  CIQ.Drawing.fibprojection
	 * @version ChartIQ Advanced Package
	 * @since 5.2.0
	 */
	CIQ.Drawing.fibprojection=function(){
		this.name="fibprojection";
		this.dragToDraw=false;
		this.p2=null;
	};

	CIQ.Drawing.fibprojection.ciqInheritsFrom(CIQ.Drawing.fibonacci);

	CIQ.Drawing.fibprojection.prototype.recommendedLevels=[0, 0.618, 1, 1.272, 1.618, 2.618, 4.236];

	CIQ.Drawing.fibprojection.prototype.click=function(context, tick, value){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		this.copyConfig();
		if(!this.penDown){
			this.setPoint(0, tick, value, panel.chart);
			this.penDown=true;
			return false;
		}
		if(this.accidentalClick(tick, value)) {
			this.stx.undo();//abort
			return true;
		}

		if(this.p2!==null){
			this.setPoint(2, this.p2[0], this.p2[1], panel.chart);
			this.parameters=CIQ.clone(this.parameters);	// separate from the global object
			return true;
		}
		this.setPoint(1, tick, value, panel.chart);

		this.p2=[this.p1[0],this.p1[1]];
		return false;	// kernel will call render after this
	};

	CIQ.Drawing.fibprojection.prototype.render=function(context){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var yAxis=panel.yAxis;
		if(!this.p1) return;
		var dist=this.p1[1]-this.p0[1];
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
		var x2=null, y2=null;
		if(this.p2) {
			x2=this.stx.pixelFromTick(this.p2[0], panel.chart);
			y2=this.stx.pixelFromValueAdjusted(panel, this.p2[0], this.p2[1]);
		}
		//old drawings missing parameters.trend
		var trend={color:"auto", parameters:{pattern:"solid", opacity:0.25, lineWidth:1}};
		if(!this.parameters.trend) this.parameters.trend=trend;
		var trendLineColor=this.setLineColor(this.parameters.trend.color);
		context.textBaseline="middle";
		this.stx.canvasFont("stx_yaxis", context); // match font from y axis so it looks cohesive
		var w=context.measureText("161.8%").width+10;// give it extra space so it does not overlap with the price labels.
		var txtColor=this.color;
		if(txtColor=="auto" || CIQ.isTransparent(txtColor)) txtColor=this.stx.defaultColor;
		if(this.p2){
			this.rays=[];
			for(var i=0;i<this.parameters.fibs.length;i++){
				context.textAlign="left";
				context.fillStyle=txtColor;
				var fib=this.parameters.fibs[i];
				if(!fib.display) continue;
				var y=this.stx.pixelFromValueAdjusted(panel, this.p2[0], this.p2[1]+dist*fib.level);
				var x=CIQ.xIntersection({x0:x0,x1:x1,y0:y0,y1:y1}, y);
				var nearX=this.parameters.extendLeft?0:x0;
				var farX=panel.left+panel.width;
				if(this.parameters.printLevels){
					var txt=Math.round(fib.level*1000)/10+"%";
					farX-=w;
					if(this.parameters.printValues) {
						context.fillStyle=txtColor; // the price labels screw up the color and font size...so reset before rendering the text
						this.stx.canvasFont("stx_yaxis", context); // use the same context as the y axis so they match.
					}
					if(farX<nearX) context.textAlign="right";
					context.fillText(txt, farX, y);
					if(farX<nearX) farX+=5;
					else  farX-=5;
				}
				if(this.parameters.printValues){
					if(x<panel.width){
						// just use the actual price that segment will render on regardless of 'isUpTrend' since the values must match the prices on the y axis, and can not be reversed.
						var price = this.stx.transformedPriceFromPixel(y,panel);
						if(yAxis.priceFormatter){
							price=yAxis.priceFormatter(this.stx, panel, price);
						}else{
							price=this.stx.formatYAxisPrice(price, panel);
						}
						if(context==this.stx.chart.context) this.stx.endClip();
						this.stx.createYAxisLabel(panel, price, y, txtColor, null, context);
						if(context==this.stx.chart.context) this.stx.startClip(panel.name);
					}
				}
				var fibColor=fib.color;
				if(fibColor=="auto" || CIQ.isTransparent(fibColor)) fibColor=this.color;
				if(fibColor=="auto" || CIQ.isTransparent(fibColor)) fibColor=this.stx.defaultColor;
				var fillColor=fib.color;
				if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.fillColor;
				if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.stx.defaultColor;
				context.fillStyle=fillColor;
				var fibParameters=CIQ.clone(fib.parameters);
				if(this.highlighted) fibParameters.opacity=1;
				this.stx.plotLine(nearX, farX, y, y, this.highlighted?trendLineColor:fibColor, "segment", context, panel, fibParameters);
				this.rays.push([[nearX,y],[farX,y]]);
				context.globalAlpha=0.05;
				context.beginPath();
				context.moveTo(farX,y);
				context.lineTo(nearX,y);
				if(nearX) context.lineTo(x0,y2);
				else context.lineTo(nearX,y2);
				context.lineTo(farX,y2);
				if( typeof fillColor!="undefined" ) context.fill(); // so legacy fibs continue to have no fill color.
				context.globalAlpha=1;
			}
		}
		var trendParameters=CIQ.clone(this.parameters.trend.parameters);
		if(this.highlighted) trendParameters.opacity=1;
		this.stx.plotLine(x0, x1, y0, y1, trendLineColor, "segment", context, panel, trendParameters);
		if(this.p2) this.stx.plotLine(x1, x2, y1, y2, trendLineColor, "segment", context, panel, trendParameters);
		if(this.highlighted){
			var p0Fill=this.highlighted=="p0"?true:false;
			var p1Fill=this.highlighted=="p1"?true:false;
			var p2Fill=this.highlighted=="p2"?true:false;
			this.littleCircle(context, x0, y0, p0Fill);
			this.littleCircle(context, x1, y1, p1Fill);
			this.littleCircle(context, x2, y2, p2Fill);
		}
	};

	CIQ.Drawing.fibprojection.prototype.move=function(context, tick, value){
		if(!this.penDown) return;
		this.copyConfig();
		if(this.p2===null) this.p1=[tick,value];
		else this.p2=[tick,value];
		this.render(context);
	};
	
	CIQ.Drawing.fibprojection.prototype.reposition=function(context, repositioner, tick, value){
		if(!repositioner) return;
		var panel=this.stx.panels[this.panelName];
		var tickDiff=repositioner.tick-tick;
		var valueDiff=repositioner.value-value;
		if(repositioner.action=="move"){
			this.setPoint(0, repositioner.p0[0]-tickDiff, repositioner.p0[1]-valueDiff, panel.chart);
			this.setPoint(1, repositioner.p1[0]-tickDiff, repositioner.p1[1]-valueDiff, panel.chart);
			this.setPoint(2, repositioner.p2[0]-tickDiff, repositioner.p2[1]-valueDiff, panel.chart);
			this.render(context);
		}else if(repositioner.action=="drag"){
			this[repositioner.point]=[tick, value];
			this.setPoint(0, this.p0[0], this.p0[1], panel.chart);
			this.setPoint(1, this.p1[0], this.p1[1], panel.chart);
			this.setPoint(2, this.p2[0], this.p2[1], panel.chart);
			this.render(context);
		}
	};


	CIQ.Drawing.fibprojection.prototype.intersected=function(tick, value, box){
		var p0=this.p0, p1=this.p1, p2=this.p2;
		if(!p0 || !p1 || !p2) return null; // in case invalid drawing (such as from panel that no longer exists)
		var pointsToCheck={0:p0, 1:p1, 2:p2};
		for(var pt in pointsToCheck){
			if(this.pointIntersection(pointsToCheck[pt][0], pointsToCheck[pt][1], box)){
				this.highlighted="p"+pt;
				return {
					action: "drag",
					point: "p"+pt
				};	
			}
		}
		var rays=this.rays;
		var isIntersected=this.lineIntersection(tick, value, box, "segment", p0, p1) ||
							this.lineIntersection(tick, value, box, "segment", p1, p2);
		if(!isIntersected){
			for(var i=0; i<rays.length; i++){
				if(this.lineIntersection(tick, value, box, "ray", rays[i][0], rays[i][1], true)){
					isIntersected=true;
					break;
				}
			}
		}
		if(isIntersected){
			this.highlighted=true;
			// This object will be used for repositioning
			return {
				action: "move",
				p0: CIQ.clone(p0),
				p1: CIQ.clone(p1),
				p2: CIQ.clone(p2),
				tick: tick, // save original tick
				value: value // save original value
			};
		}
		return null;
	};

	CIQ.Drawing.fibprojection.prototype.adjust=function(){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		this.setPoint(0, this.d0, this.v0, panel.chart);
		this.setPoint(1, this.d1, this.v1, panel.chart);
		this.setPoint(2, this.d2, this.v2, panel.chart);
	};
	
	/**
	 * Fibonacci Arc drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.fibonacci}
	 * @constructor
	 * @name  CIQ.Drawing.fibarc
	 * @since 2015-11-1
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.fibarc=function(){
		this.name="fibarc";
		//this.dragToDraw=true;
	};

	CIQ.Drawing.fibarc.ciqInheritsFrom(CIQ.Drawing.fibonacci);

	CIQ.Drawing.fibarc.prototype.recommendedLevels=[0.382, 0.5, 0.618, 1];

	CIQ.Drawing.fibarc.prototype.setOuter=function(){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;

		this.outer={
			p0: CIQ.clone(this.p0),
			p1: CIQ.clone(this.p1)
		};
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
		var x0=this.stx.pixelFromTick(this.p0[0],panel.chart);
		var x1=this.stx.pixelFromTick(this.p1[0],panel.chart);
		var y=2*y0-y1;
		var x=CIQ.xIntersection({x0:x0,x1:x1,y0:y0,y1:y1}, y);
		this.outer.p0[1]=this.stx.valueFromPixel(y, panel);
		this.outer.p0[0]=this.stx.tickFromPixel(x, panel.chart);
	};

	CIQ.Drawing.fibarc.prototype.intersected=function(tick, value, box){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var p0=this.p0, p1=this.p1, outer=this.outer;
		if(!p0 || !p1) return null; // in case invalid drawing (such as from panel that no longer exists)
		var pointsToCheck={0:p0, 1:p1};
		for(var pt in pointsToCheck){
			if(this.pointIntersection(pointsToCheck[pt][0], pointsToCheck[pt][1], box)){
				this.highlighted="p"+pt;
				return {
					action: "drag",
					point: "p"+pt
				};	
			}
		}
		if(this.lineIntersection(tick, value, box, "segment", outer.p0, outer.p1)){
			this.highlighted=true;
			// This object will be used for repositioning
			return {
				action: "move",
				p0: CIQ.clone(p0),
				p1: CIQ.clone(p1),
				tick: tick, // save original tick
				value: value // save original value
			};
		}
		// Just test the box circumscribing the arcs
		var points={x0:p0[0],x1:p1[0],y0:p0[1],y1:p1[1]};
		var pixelArea=CIQ.convertBoxToPixels(this.stx,this.panelName,points);
		var extend={
			x:Math.abs(Math.sqrt(2)*(pixelArea.x1-pixelArea.x0)),
			y:Math.abs(Math.sqrt(2)*(pixelArea.y1-pixelArea.y0))
		};
		var x=this.stx.pixelFromTick(tick, panel.chart);
		var y=this.stx.pixelFromValueAdjusted(panel, tick, value);

		if(x<pixelArea.x1-extend.x || x>pixelArea.x1+extend.x) return null;
		if(y<pixelArea.y1-extend.y || y>pixelArea.y1+extend.y) return null;
		if(pixelArea.y0<pixelArea.y1 && y>pixelArea.y1) return null;
		if(pixelArea.y0>pixelArea.y1 && y<pixelArea.y1) return null;
		this.highlighted=true;
		return {
			action: "move",
			p0: CIQ.clone(this.p0),
			p1: CIQ.clone(this.p1),
			tick: tick,
			value: value
		};		
	};

	CIQ.Drawing.fibarc.prototype.render=function(context){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var yAxis=panel.yAxis;
		if(!this.p1) return;
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
		var isUpTrend=y1<y0;
		var factor=Math.abs((y1-y0)/(x1-x0));

		var trendLineColor=this.setLineColor(this.parameters.trend.color);
		context.textBaseline="middle";
		this.stx.canvasFont("stx_yaxis", context); // match font from y axis so it looks cohesive
		var txtColor=this.color;
		if(txtColor=="auto" || CIQ.isTransparent(txtColor)) txtColor=this.stx.defaultColor;
		for(var i=0;i<this.parameters.fibs.length;i++){
			context.fillStyle=txtColor;
			var fib=this.parameters.fibs[i];
			if(fib.level<0 || !fib.display) continue;
			var radius=Math.abs(this.p1[1]-this.p0[1])*Math.sqrt(2)*fib.level;
			var value=this.p1[1]+radius*(isUpTrend?-1:1);
			var y=this.stx.pixelFromValueAdjusted(panel, this.p0[0], value);
			var x=CIQ.xIntersection({x0:x0,x1:x1,y0:y0,y1:y1}, y);
			if(this.parameters.printLevels){
				context.textAlign="center";
				var txt=Math.round(fib.level*1000)/10+"%";
				if(this.parameters.printValues) {
					context.fillStyle=txtColor; // the price labels screw up the color and font size...so  reset before rendering the text
					this.stx.canvasFont("stx_yaxis", context); // use the same context as the y axis so they match.
				}
				context.fillText(txt, x1, Math.round(y-5));
			}
			context.textAlign="left";
			if(this.parameters.printValues){
				if(x<panel.width){
					// just use the actual price that segment will render on regardless of 'isUpTrend' since the values must match the prices on the y axis, and can not be reversed.
					var price = value;
					if(yAxis.priceFormatter){
						price=yAxis.priceFormatter(this.stx, panel, price);
					}else{
						price=this.stx.formatYAxisPrice(price, panel);
					}
					if(context==this.stx.chart.context) this.stx.endClip();
					this.stx.createYAxisLabel(panel, price, y, txtColor, null, context);
					if(context==this.stx.chart.context) this.stx.startClip(panel.name);
				}
			}
			var fibColor=fib.color;
			if(fibColor=="auto" || CIQ.isTransparent(fibColor)) fibColor=this.color;
			if(fibColor=="auto" || CIQ.isTransparent(fibColor)) fibColor=this.stx.defaultColor;
			context.strokeStyle=this.highlight?trendLineColor:fibColor;
			var fillColor=fib.color;
			if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.fillColor;
			if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.stx.defaultColor;
			context.fillStyle=fillColor;
			context.globalAlpha=this.highlighted?1:fib.parameters.opacity;
			context.lineWidth=fib.parameters.lineWidth;
			if(context.setLineDash){
				context.setLineDash(CIQ.borderPatternToArray(context.lineWidth,fib.parameters.pattern));
				context.lineDashOffset=0;  //start point in array
			}
			context.save();
			context.beginPath();
			context.scale(1/factor,1);
			context.arc(x1*factor, y1, Math.abs(y-y1), 0, Math.PI, !isUpTrend);
			if(this.pattern!="none") context.stroke();
			context.globalAlpha=0.05;
			context.fill();
			context.restore();
			if(context.setLineDash) context.setLineDash([]);
			context.globalAlpha=1;
		}
		context.textAlign="left";
		// ensure we at least draw trend line from zero to 100
		var trendParameters=CIQ.clone(this.parameters.trend.parameters);
		if(this.highlighted) trendParameters.opacity=1;
		this.stx.plotLine(x1, 2*x0-x1, y1, 2*y0-y1, trendLineColor, "segment", context, panel, trendParameters);
		if(this.highlighted){
			var p0Fill=this.highlighted=="p0"?true:false;
			var p1Fill=this.highlighted=="p1"?true:false;
			this.littleCircle(context, x0, y0, p0Fill);
			this.littleCircle(context, x1, y1, p1Fill);
		}
	};

	/**
	 * Fibonacci Fan drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.fibonacci}
	 * @constructor
	 * @name  CIQ.Drawing.fibfan
	 * @since 2015-11-1
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.fibfan=function(){
		this.name="fibfan";
		//this.dragToDraw=true;
	};

	CIQ.Drawing.fibfan.ciqInheritsFrom(CIQ.Drawing.fibonacci);

	CIQ.Drawing.fibfan.prototype.recommendedLevels=[0, 0.382, 0.5, 0.618, 1];

	CIQ.Drawing.fibfan.prototype.setOuter=function(){};

	CIQ.Drawing.fibfan.prototype.render=function(context){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var yAxis=panel.yAxis;
		if(!this.p1) return;
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
		var top=Math.min(y1, y0);
		var bottom=Math.max(y1, y0);
		var height=bottom-top;
		var isUpTrend=(y1-y0)/(x1-x0)>0;

		var trendLineColor=this.setLineColor(this.parameters.trend.color);

		context.textBaseline="middle";
		this.stx.canvasFont("stx_yaxis", context); // match font from y axis so it looks cohesive
		var w=context.measureText("161.8%").width+10;// give it extra space so it does not overlap with the price labels.
		var /*minX=Number.MAX_VALUE,*/ minY=Number.MAX_VALUE, /*maxX=Number.MAX_VALUE*-1,*/ maxY=Number.MAX_VALUE*-1;
		var txtColor=this.color;
		if(txtColor=="auto" || CIQ.isTransparent(txtColor)) txtColor=this.stx.defaultColor;
		this.rays=[];
		for(var i=0;i<this.parameters.fibs.length;i++){
			context.fillStyle=txtColor;
			var fib=this.parameters.fibs[i];
			if(!fib.display) continue;
			//var y=(y0-y1)*fib.level+y1;
			var y=this.stx.pixelFromValueAdjusted(panel, this.p0[0], (this.p0[1]-this.p1[1])*fib.level+this.p1[1]);
			var x=CIQ.xIntersection({x0:x1,x1:x1,y0:y0,y1:y1}, y);
			var farX=panel.left;
			if(x1>x0) farX+=panel.width;
			var farY=(farX-x0)*(y-y0)/(x-x0)+y0;
			if(x0>farX-(this.parameters.printLevels?w+5:0) && x1>x0) continue;
			else if(x0<farX+(this.parameters.printLevels?w+5:0) && x1<x0) continue;
			if(this.parameters.printLevels){
				var txt=Math.round(fib.level*1000)/10+"%";
				if(x1>x0){
					farX-=w;
					context.textAlign="left";
				}else{
					farX+=w;
					context.textAlign="right";
				}
				if(this.parameters.printValues) {
					context.fillStyle=txtColor; // the price labels screw up the color and font size...so reset before rendering the text
					this.stx.canvasFont("stx_yaxis", context); // use the same context as the y axis so they match.
				}
				farY=(farX-x0)*(y-y0)/(x-x0)+y0;
				context.fillText(txt, farX, farY);
				if(x1>x0) farX-=5;
				else farX+=5;
			}
			context.textAlign="left";
			if(this.parameters.printValues){
				if(x<panel.width){
					// just use the actual price that segment will render on regardless of 'isUpTrend' since the values must match the prices on the y axis, and can not be reversed.
					var price = this.stx.transformedPriceFromPixel(y,panel);
					if(yAxis.priceFormatter){
						price=yAxis.priceFormatter(this.stx, panel, price);
					}else{
						price=this.stx.formatYAxisPrice(price, panel);
					}
					if(context==this.stx.chart.context) this.stx.endClip();
					this.stx.createYAxisLabel(panel, price, y, txtColor, null, context);
					if(context==this.stx.chart.context) this.stx.startClip(panel.name);
				}
			}
			var fibColor=fib.color;
			if(fibColor=="auto" || CIQ.isTransparent(fibColor)) fibColor=this.color;
			if(fibColor=="auto" || CIQ.isTransparent(fibColor)) fibColor=this.stx.defaultColor;
			var fillColor=fib.color;
			if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.fillColor;
			if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.stx.defaultColor;
			context.fillStyle=fillColor;
			if(this.parameters.printLevels) farY=(farX-x0)*(y-y0)/(x-x0)+y0;
			var fibParameters=CIQ.clone(fib.parameters);
			if(this.highlighted) fibParameters.opacity=1;
			this.stx.plotLine(x0, farX, y0, farY, (this.highlighted?trendLineColor:fibColor), "segment", context, panel, fibParameters);
			this.rays.push([[x0,y0],[farX,farY]]);
			context.globalAlpha=0.05;
			context.beginPath();
			context.moveTo(farX,farY);
			context.lineTo(x0,y0);
			context.lineTo(farX,y0);
			context.fill();
			context.globalAlpha=1;
			if(y<minY){
				//minX=x;
				minY=y;
			}
			if(y>maxY){
				//maxX=x;
				maxY=y;
			}
		}
		// ensure we at least draw trend line from zero to 100
		for (var level = 0; level <= 1; level++) {
			var yy=isUpTrend?bottom-height*level:top+height*level;
			yy=Math.round(yy);
			if(yy<minY){
				//minX=CIQ.xIntersection({x0:x1,x1:x1,y0:y0,y1:y1}, yy);
				minY=yy;
			}
			if(yy>maxY){
				//maxX=CIQ.xIntersection({x0:x1,x1:x1,y0:y0,y1:y1}, yy);
				maxY=yy;
			}
		}
		//this.stx.plotLine(minX, maxX, minY, maxY, trendLineColor, "segment", context, panel, this.parameters.trend.parameters);
		if(this.highlighted){
			var p0Fill=this.highlighted=="p0"?true:false;
			var p1Fill=this.highlighted=="p1"?true:false;
			this.littleCircle(context, x0, y0, p0Fill);
			this.littleCircle(context, x1, y1, p1Fill);
		}
	};

	/**
	 * Fibonacci Time Zone drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.fibonacci}
	 * @constructor
	 * @name  CIQ.Drawing.fibtimezone
	 * @since 2015-11-1
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.fibtimezone=function(){
		this.name="fibtimezone";
		//this.dragToDraw=true;
	};

	CIQ.Drawing.fibtimezone.ciqInheritsFrom(CIQ.Drawing.fibonacci);

	CIQ.Drawing.fibtimezone.prototype.render=function(context){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		if(!this.p1) return;
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
		var fibs=[1,0];

		var trendLineColor=this.setLineColor(this.parameters.trend.color);

		context.textBaseline="middle";
		this.stx.canvasFont("stx_yaxis", context); // match font from y axis so it looks cohesive
		var h=20;// give it extra space so it does not overlap with the date labels.
		var mult=this.p1[0]-this.p0[0];
		var txtColor=this.color;
		if(txtColor=="auto" || CIQ.isTransparent(txtColor)) txtColor=this.stx.defaultColor;
		context.textAlign="center";

		var x=x0;
		var top=panel.yAxis.top;
		var farY=panel.yAxis.bottom;
		var txt=0;
		var fibColor=this.parameters.timezone.color;
		if(fibColor=="auto" || CIQ.isTransparent(fibColor)) fibColor=this.color;
		if(fibColor=="auto" || CIQ.isTransparent(fibColor)) fibColor=this.stx.defaultColor;
		var fillColor=this.parameters.timezone.color;
		if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.fillColor;
		if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.stx.defaultColor;

		if(this.parameters.printLevels) farY-=h-7;

		var tzParameters=CIQ.clone(this.parameters.timezone.parameters);
		if(this.highlighted) tzParameters.opacity=1;
		do{
			x=this.stx.pixelFromTick(this.p0[0]+txt*mult, panel.chart);
			if(x0<x1 && x>panel.left+panel.width) break;
			else if(x0>x1 && x<panel.left) break;
			if(this.parameters.printLevels){
				context.fillStyle=txtColor;
				context.fillText((x1>x0?txt:txt*-1), x, farY+7);
			}
			context.fillStyle=fillColor;
			this.stx.plotLine(x, x, 0, farY, this.highlighted?trendLineColor:fibColor, "segment", context, panel, tzParameters);
			context.globalAlpha=0.05;
			context.beginPath();
			context.moveTo(x0,top);
			context.lineTo(x,top);
			context.lineTo(x,farY);
			context.lineTo(x0,farY);
			context.fill();
			context.globalAlpha=1;
			txt=fibs[0]+fibs[1];
			fibs.unshift(txt);
		}while(mult);
		context.textAlign="left";
		this.stx.plotLine(x0, x1, y0, y1, trendLineColor, "segment", context, panel, tzParameters);
		if(this.highlighted){
			var p0Fill=this.highlighted=="p0"?true:false;
			var p1Fill=this.highlighted=="p1"?true:false;
			this.littleCircle(context, x0, y0, p0Fill);
			this.littleCircle(context, x1, y1, p1Fill);
		}else{
			// move points so always accessible
			var yVal=this.stx.valueFromPixel(panel.height/2,panel);
			this.setPoint(0, this.p0[0], yVal, panel.chart);
			this.setPoint(1, this.p1[0], yVal, panel.chart);
		}
	};

	CIQ.Drawing.fibtimezone.prototype.intersected=function(tick, value, box){
		var p0=this.p0, p1=this.p1, panel=this.stx.panels[this.panelName];
		if(!p0 || !p1 || !panel) return null; // in case invalid drawing (such as from panel that no longer exists)
		var pointsToCheck={0:p0, 1:p1};
		for(var pt in pointsToCheck){
			if(this.pointIntersection(pointsToCheck[pt][0], pointsToCheck[pt][1], box)){
				this.highlighted="p"+pt;
				return {
					action: "drag",
					point: "p"+pt
				};	
			}
		}
		// Check for over the trend line or the 0 vertical line
		var trendIntersects=this.lineIntersection(tick, value, box, "segment");
		if(trendIntersects || (box.x0<=this.p0[0] && box.x1>=p0[0])){
			this.highlighted=true;
			return {
				action: "move",
				p0: CIQ.clone(p0),
				p1: CIQ.clone(p1),
				tick: tick, // save original tick
				value: value // save original value
			};
		}
		return null;
	};

	/**
	 * shape is a default implementation of a {@link CIQ.Drawing.BaseTwoPoint} drawing
	 * which places a "shape" on the canvas.  It can be rotated and/or stretched.
	 * It is meant to be overridden with specific shape designs, such as arrows....
	 * @constructor
	 * @name  CIQ.Drawing.shape
	 * @since 2015-11-1
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.shape=function(){
		this.name="shape";
		this.radians=0;
		this.a=0;
		this.rotating=false;
		this.textMeasure=false;
		this.configurator="shape";  //forces all derived classes to default to shape drawing tools
		this.dimension=[0,0];
		this.points=[];
	};

	CIQ.Drawing.shape.ciqInheritsFrom(CIQ.Drawing.BaseTwoPoint);

	CIQ.Drawing.shape.prototype.measure=function(){};

	CIQ.Drawing.shape.prototype.render=function(context){
		if(!this.points.length) return;
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		if(this.p1){
			var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
			var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);

			context.globalAlpha=0.5;
			context.fillStyle="#000000";
			if(this.rotating){
				this.radians=Math.atan((y1-y0)/(x1-x0));
				if(x1<x0) this.radians+=Math.PI;
				else if(y1<y0) this.radians+=2*Math.PI;
				this.a=parseInt((this.radians*36/Math.PI).toFixed(0),10)*5;
				this.a%=360;
				this.radians=this.a*Math.PI/180;
				if(this.textMeasure) context.fillText(this.a+"\u00b0",x1+10,y1+10);
			}else if(this.penDown){
				this.sx=Math.max(1,parseFloat(Math.abs(2*(x1-x0)/this.dimension[0]).toFixed(1)));
				if(x1<x0) this.sx*=-1;
				this.sy=Math.max(1,parseFloat(Math.abs(2*(y1-y0)/this.dimension[1]).toFixed(1)));
				if(y1<y0) this.sy*=-1;
				if(this.textMeasure) context.fillText(this.sx+"x,"+this.sy+"x",x1+this.sx+5,y1+this.sy+5);
			}
			context.globalAlpha=1;
		}

		var lineWidth=this.lineWidth;
		if(!lineWidth) lineWidth=1.1;

		var parameters={
				pattern: this.pattern,
				lineWidth: lineWidth
		};
		if(this.highlighted && parameters.pattern=="none"){
			parameters.pattern="solid";
			if(parameters.lineWidth==0.1) parameters.lineWidth=1;
		}
		var edgeColor=this.color;
		if(edgeColor=="auto" || CIQ.isTransparent(edgeColor)) edgeColor=this.stx.defaultColor;
		if(this.highlighted){
			edgeColor=this.stx.getCanvasColor("stx_highlight_vector");
			if(lineWidth==0.1) lineWidth=1.1;
		}
		var fillColor=this.fillColor;
		lineWidth/=(Math.abs((this.sx*this.sy))*2/(Math.abs(this.sx)+Math.abs(this.sy)));

		context.save();
		context.translate(x0,y0);
		context.rotate(this.radians);
		context.scale(this.sx,this.sy);

		var subshape, point;
		for(subshape=0;subshape<this.points.length;subshape++){
			context.beginPath();
			for(point=0;point<this.points[subshape].length;point++){
				var x,y,cx1,cx2,cy1,cy2;
				if(this.points[subshape][point]=="M"){ //move
					x=this.points[subshape][++point]-(this.dimension[0]-1)/2;
					y=this.points[subshape][++point]-(this.dimension[1]-1)/2;
					context.moveTo(x,y);
				}else if(this.points[subshape][point]=="L"){ //line
					x=this.points[subshape][++point]-(this.dimension[0]-1)/2;
					y=this.points[subshape][++point]-(this.dimension[1]-1)/2;
					context.lineTo(x,y);
				}else if(this.points[subshape][point]=="Q"){ //quadratic
					cx1=this.points[subshape][++point]-(this.dimension[0]-1)/2;
					cy1=this.points[subshape][++point]-(this.dimension[1]-1)/2;
					x=this.points[subshape][++point]-(this.dimension[0]-1)/2;
					y=this.points[subshape][++point]-(this.dimension[1]-1)/2;
					context.quadraticCurveTo(cx1,cy1,x,y);
				}else if(this.points[subshape][point]=="B"){ //bezier
					cx1=this.points[subshape][++point]-(this.dimension[0]-1)/2;
					cy1=this.points[subshape][++point]-(this.dimension[1]-1)/2;
					cx2=this.points[subshape][++point]-(this.dimension[0]-1)/2;
					cy2=this.points[subshape][++point]-(this.dimension[1]-1)/2;
					x=this.points[subshape][++point]-(this.dimension[0]-1)/2;
					y=this.points[subshape][++point]-(this.dimension[1]-1)/2;
					context.bezierCurveTo(cx1,cy1,cx2,cy2,x,y);
				}
			}
			context.closePath();

			if(fillColor && !CIQ.isTransparent(fillColor) && fillColor!="auto"){
				//context.globalAlpha=0.4;
				context.fillStyle=fillColor;
				context.fill();
				//context.globalAlpha=1;
			}
			if(edgeColor && this.pattern!="none"){
				context.strokeStyle=edgeColor;
				context.lineWidth=lineWidth;
				if(context.setLineDash){
					context.setLineDash(CIQ.borderPatternToArray(lineWidth,this.pattern));
					context.lineDashOffset=0;  //start point in array
				}
				context.stroke();
			}
		}

		//context.strokeRect(-(this.dimension[0]-1)/2,-(this.dimension[1]-1)/2,this.dimension[0]-1,this.dimension[1]-1);

		context.restore();
		context.save();
		context.translate(x0,y0);
		context.rotate(this.radians);

		if(this.highlighted){
			var p0Fill=this.highlighted=="p0"?true:false;
			var p1Fill=this.highlighted=="p1"?true:false;
			var p2Fill=this.highlighted=="p2"?true:false;
			this.littleCircle(context, 0, 0, p0Fill);
			this.mover(context, 0, 0, p0Fill);
			this.littleCircle(context, this.sx*this.dimension[0]/2, this.sy*this.dimension[1]/2, p1Fill);
			this.resizer(context, this.sx*this.dimension[0]/2, this.sy*this.dimension[1]/2, p1Fill);
			this.littleCircle(context, this.sx*this.dimension[0]/2, 0, p2Fill);
			this.rotator(context, this.sx*this.dimension[0]/2, 0, p2Fill);
			context.globalAlpha=0.5;
			context.fillStyle="#000000";
			if(this.textMeasure){
				context.fillText(this.sx+"x,"+this.sy+"x",this.sx*this.dimension[0]/2+12,this.sy*this.dimension[1]/2+5);
				context.fillText(this.a+"\u00b0",this.sx*this.dimension[0]/2+12,5);
			}
			context.globalAlpha=1;
		}else if(this.penDown){
			if(this.rotating){
				this.rotator(context, this.sx*this.dimension[0]/2, 0, true);
			}else{
				this.resizer(context, this.sx*this.dimension[0]/2, this.sy*this.dimension[1]/2, true);
			}
		}
		context.restore();
	};

	CIQ.Drawing.shape.prototype.reposition=function(context, repositioner, tick, value){
		if(!repositioner) return;
		var panel=this.stx.panels[this.panelName];
		if(repositioner.action=="move"){
			var tickDiff=repositioner.tick-tick;
			var valueDiff=repositioner.value-value;
			this.setPoint(0, repositioner.p0[0]-tickDiff, repositioner.p0[1]-valueDiff, panel.chart);
			this.render(context);
		}else{
			var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
			var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
			var x1=this.stx.pixelFromTick(tick, panel.chart);
			var y1=this.stx.pixelFromValueAdjusted(panel, tick, value);
			if(repositioner.action=="scale"){
				this[repositioner.point]=[tick, value];
				this.sx=parseFloat((((x1-x0)*Math.cos(this.radians)+(y1-y0)*Math.sin(this.radians))/(this.dimension[0]/2)).toFixed(1));
				if(Math.abs(this.sx)<1) this.sx/=Math.abs(this.sy);
				this.sy=parseFloat((((y1-y0)*Math.cos(this.radians)-(x1-x0)*Math.sin(this.radians))/(this.dimension[1]/2)).toFixed(1));
				if(Math.abs(this.sy)<1) this.sy/=Math.abs(this.sy);
				this.render(context);
			}else if(repositioner.action=="rotate"){
				this[repositioner.point]=[tick, value];
				this.radians=Math.atan((y1-y0)/(x1-x0));
				if(x1<x0) this.radians+=Math.PI;
				else if(y1<y0) this.radians+=2*Math.PI;
				this.a=parseInt((this.radians*36/Math.PI).toFixed(0),10)*5;
				if(this.sx<0) this.a=this.a+180;
				this.a%=360;
				this.radians=this.a*Math.PI/180;
				this.render(context);
			}
		}
	};

	CIQ.Drawing.shape.prototype.intersected=function(tick, value, box){
		if(!this.p0) return null; // in case invalid drawing (such as from panel that no longer exists)
		if(this.stx.repositioningDrawing==this && this.stx.repositioningDrawing.repositioner) return this.stx.repositioningDrawing.repositioner;

		var panel=this.stx.panels[this.panelName];
		var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
		var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var x1=this.stx.pixelFromTick(tick, panel.chart);
		var y1=this.stx.pixelFromValueAdjusted(panel, tick, value);

		x1-=x0;
		y1-=y0;
		var y1t=y1, x1t=x1;
		x1=Math.cos(this.radians)*x1t + Math.sin(this.radians)*y1t;
		y1=Math.cos(this.radians)*y1t - Math.sin(this.radians)*x1t;
		x1/=this.sx;
		y1/=this.sy;
		var circleR2=Math.pow(CIQ.touchDevice?25:5+this.littleCircleRadius(),2);
		var scaledCircleR2=Math.abs(circleR2/(this.sx*this.sy));
		var overShape=Math.pow(this.dimension[0]/2,2)+Math.pow(this.dimension[1]/2,2)>(Math.pow(x1,2)+Math.pow(y1,2));
		var moveProximity=(circleR2-(Math.pow(x1*this.sx,2)+Math.pow(y1*this.sy,2)))/Math.abs(this.sx*this.sy);
		var scaleProximity=scaledCircleR2-(Math.pow(x1-this.dimension[0]/2,2)+Math.pow(y1-this.dimension[1]/2,2));
		var rotateProximity=scaledCircleR2-(Math.pow(x1-this.dimension[0]/2,2)+Math.pow(y1,2));
		//console.log("s:"+scaleProximity+" r:"+rotateProximity+" m:"+moveProximity);
		if(scaleProximity>0 && scaleProximity>=rotateProximity && scaleProximity>=moveProximity){
			this.highlighted="p1";
			return {
				action: "scale"
			};
		}else if(rotateProximity>0 && rotateProximity>=scaleProximity && rotateProximity>=moveProximity){
			this.highlighted="p2";
			return {
				action: "rotate"
			};
		}else if(moveProximity>0 && moveProximity>=scaleProximity && moveProximity>=rotateProximity){
			this.highlighted="p0";
			return {
				action: "move",
				p0: CIQ.clone(this.p0),
				tick: tick,
				value: value
			};
		}else if(overShape){
			this.highlighted=true;
			return {};
		}
		return null;
	};

	CIQ.Drawing.shape.prototype.configs=["color","fillColor","lineWidth","pattern"];

	CIQ.Drawing.shape.prototype.littleCircleRadius=function(){
		return 3;
	};

	CIQ.Drawing.shape.prototype.click=function(context, tick, value){
		if(!this.points.length) return false;
		this.copyConfig();
		var panel=this.stx.panels[this.panelName];
		if(!this.penDown){
			this.setPoint(0, tick, value, panel.chart);
			this.penDown=true;
			return false;
		}
		//if(this.accidentalClick(tick, value)) return this.dragToDraw;

		this.setPoint(1, tick, value, panel.chart);

		if(this.rotating) {
			this.penDown=false;
			this.rotating=false;
			return true;	// kernel will call render after this
		}
		this.rotating=true;
		return false;
	};

	CIQ.Drawing.shape.prototype.adjust=function(){
		var panel=this.stx.panels[this.panelName];
		if(!panel) return;
		this.setPoint(0, this.d0, this.v0, panel.chart);
		this.radians=Math.round(this.a/5)*Math.PI/36;
	};

	/**
	 * Reconstruct a shape
	 * @param  {CIQ.ChartEngine} stx The chart object
	 * @param  {object} [obj] A drawing descriptor
	 * @param {string} [obj.col] The border color
	 * @param {string} [obj.fc] The fill color
	 * @param {string} [obj.pnl] The panel name
	 * @param {string} [obj.ptrn] Pattern for line "solid","dotted","dashed". Defaults to solid.
	 * @param {number} [obj.lw] Line width. Defaults to 1.
	 * @param {number} [obj.v0] Value (price) for the center point
	 * @param {number} [obj.d0] Date (string form) for the center point
	 * @param {number} [obj.tzo0] Offset of UTC from d0 in minutes
	 * @param {number} [obj.a] Angle of the rotation in degrees
	 * @param {number} [obj.sx] Horizontal scale factor
	 * @param {number} [obj.sy] Vertical scale factor
	 * @memberOf CIQ.Drawing.shape
	 */
	CIQ.Drawing.shape.prototype.reconstruct=function(stx, obj){
		this.stx=stx;
		this.color=obj.col;
		this.fillColor=obj.fc;
		this.panelName=obj.pnl;
		this.pattern=obj.ptrn;
		this.lineWidth=obj.lw;
		this.d0=obj.d0;
		this.v0=obj.v0;
		this.tzo0=obj.tzo0;
		this.a=obj.a;
		this.sx=obj.sx;
		this.sy=obj.sy;
		this.adjust();
	};

	CIQ.Drawing.shape.prototype.serialize=function(){
		return {
			name:this.name,
			pnl: this.panelName,
			col:this.color,
			fc:this.fillColor,
			ptrn:this.pattern,
			lw:this.lineWidth,
			d0:this.d0,
			v0:this.v0,
			tzo0: this.tzo0,
			a:this.a,
			sx:this.sx,
			sy:this.sy
		};
	};

	/* Drawing specific shapes
	*
	* this.dimension: overall dimension of shape as designed, as a pair [dx,dy] where dx is length and dy is width, in pixels
	* this.points: array of arrays.  Each array represents a closed loop subshape.
	* 	within each array is a series of values representing coordinates.
	* 	For example, ["M",0,0,"L",1,1,"L",2,1,"Q",3,3,4,1,"B",5,5,0,0,3,3]
	* 	The array will be parsed by the render function:
	* 		"M" - move to the xy coordinates represented by the next 2 array elements
	* 		"L" - draw line to xy coordinates represented by the next 2 array elements
	* 		"Q" - draw quadratic curve where next 2 elements are the control point and following 2 elements are the end coordinates
	* 		"B" - draw bezier curve where next 2 elements are first control point, next 2 elements are second control point, and next 2 elements are the end coordinates
	* See sample shapes below.
	*
	*/

	CIQ.Drawing.xcross=function(){
		this.name="xcross";
		this.dimension=[7,7];
		this.points=[
		             ["M",1,0,"L",3,2,"L",5,0,"L",6,1,"L",4,3,"L",6,5,"L",5,6,"L",3,4,"L",1,6,"L",0,5,"L",2,3,"L",0,1,"L",1,0]
		             ];
	};
	CIQ.Drawing.xcross.ciqInheritsFrom(CIQ.Drawing.shape);

	CIQ.Drawing.arrow=function(){
		this.name="arrow";
		this.dimension=[11,11];
		this.points=[
		             ["M",3,0,"L",7,0,"L",7,5,"L",10,5,"L",5,10,"L",0,5,"L",3,5,"L",3,0]
		             ];
	};
	CIQ.Drawing.arrow.ciqInheritsFrom(CIQ.Drawing.shape);

	CIQ.Drawing.check=function(){
		this.name="check";
		this.dimension=[8,9];
		this.points=[
		             ["M",1,5,"L",0,6,"L",2,8,"L",7,1,"L",6,0,"L",2,6,"L",1,5]
		             ];
	};
	CIQ.Drawing.check.ciqInheritsFrom(CIQ.Drawing.shape);

	CIQ.Drawing.star=function(){
		this.name="star";
		this.dimension=[12,12];
		this.points=[
		             ["M",0,4,"L",4,4,"L",5.5,0,"L",7,4,"L",11,4,"L",8,7,"L",9,11,"L",5.5,9,"L",2,11,"L",3,7,"L",0,4]
		             ];
	};
	CIQ.Drawing.star.ciqInheritsFrom(CIQ.Drawing.shape);

	CIQ.Drawing.heart=function(){
		this.name="heart";
		this.dimension=[23,20];
		this.points=[
		             ["M",11,3,"B",11,2.4,10,0,6,0,"B",0,0,0,7.5,0,7.5,"B",0,11,4,15.4,11,19,"B",18,15.4,22,11,22,7.5,"B",22,7.5,22,0,16,0,"B",13,0,11,2.4,11,3]
		             ];
	};
	CIQ.Drawing.heart.ciqInheritsFrom(CIQ.Drawing.shape);

	CIQ.Drawing.focusarrow=function(){
		this.name="focusarrow";
		this.dimension=[7,5];
		this.points=[
		              ["M",0,0,"L",2,2,"L",0,4,"L",0,0],
		              ["M",6,0,"L",4,2,"L",6,4,"L",6,0]
		             ];
	};
	CIQ.Drawing.focusarrow.ciqInheritsFrom(CIQ.Drawing.shape);


	/**
	 * Crossline drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.horizontal}
	 * @constructor
	 * @name  CIQ.Drawing.crossline
	 * @since 2016-09-19
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.crossline=function(){ this.name="crossline"; };
	CIQ.Drawing.crossline.ciqInheritsFrom(CIQ.Drawing.horizontal);
	CIQ.extend(CIQ.Drawing.crossline.prototype,{
		measure: function(){},
		accidentalClick: function(tick, value){ return false; },
		adjust: function(){
			var panel=this.stx.panels[this.panelName];
			if(!panel) return;
			this.setPoint(0, this.d0, this.v0, panel.chart);
			this.p1=CIQ.clone(this.p0);
		},
		intersected: function(tick, value, box){
			if(!this.p0 || !this.p1) return null;
			this.p1[0]+=1;
			var isIntersected=this.lineIntersection(tick, value, box, "line");
			this.p1=CIQ.clone(this.p0);
			if(!isIntersected){
				this.p1[1]+=1;
				isIntersected=this.lineIntersection(tick, value, box, "line");
				this.p1=CIQ.clone(this.p0);
				if(!isIntersected) return null;
			}
			this.highlighted=true;
			if(this.pointIntersection(this.p0[0], this.p0[1], box)){
				this.highlighted="p0";
			}
			// This object will be used for repositioning
			return {
				action: "move",
				p0: CIQ.clone(this.p0),
				p1: CIQ.clone(this.p1),
				tick: tick, // save original tick
				value: value // save original value
			};
		},
		render: function(context){
			var panel=this.stx.panels[this.panelName];
			if(!panel) return;
			var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
			var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);

			var color=this.setLineColor();

			var parameters={
					pattern: this.pattern,
					lineWidth: this.lineWidth
			};
			this.stx.plotLine(x0, x0+100, y0, y0, color, "horizontal", context, panel, parameters);
			this.stx.plotLine(x0, x0, y0, y0+100, color, "vertical", context, panel, parameters);

			if(this.axisLabel && !this.repositioner){
				this.stx.endClip();
				var txt=this.p0[1];
				if(panel.chart.transformFunc) txt=panel.chart.transformFunc(this.stx, panel.chart, txt);
				if(panel.yAxis.priceFormatter)
					txt=panel.yAxis.priceFormatter(this.stx, panel, txt);
				else
					txt=this.stx.formatYAxisPrice(txt, panel);
				this.stx.createYAxisLabel(panel, txt, y0, color);
				this.stx.startClip(panel.name);
				if(this.p0[0]>=0 && !this.stx.chart.xAxis.noDraw) { // don't try to compute dates from before dataSet
					var dt, newDT;
					/* set d0 to the right timezone */
					dt=this.stx.dateFromTick(this.p0[0], panel.chart, true);
					if(!CIQ.ChartEngine.isDailyInterval(this.stx.layout.interval)){
						var milli=dt.getSeconds()*1000+dt.getMilliseconds();
						if(this.stx.displayZone){ // this converts from the quote feed timezone to the chart specified time zone
							newDT=new timezoneJS.Date(dt.getTime(), this.stx.displayZone);
							dt=new Date(newDT.getFullYear(), newDT.getMonth(), newDT.getDate(), newDT.getHours(), newDT.getMinutes());
							dt=new Date(dt.getTime()+milli);
						}
					}else{
						dt.setHours(0,0,0,0);
					}
					var myDate=CIQ.mmddhhmm(CIQ.yyyymmddhhmm(dt));
					/***********/
					if(panel.chart.xAxis.formatter){
						myDate=panel.chart.xAxis.formatter(dt);
					}else if(this.stx.internationalizer){
						var str;
						if(dt.getHours()!==0 || dt.getMinutes()!==0){
							str=this.stx.internationalizer.monthDay.format(dt);
							str+=" " + this.stx.internationalizer.hourMinute.format(dt);
						}else{
							str=this.stx.internationalizer.yearMonthDay.format(dt);
						}
						myDate=str;
					}
					this.stx.endClip();
					this.stx.createXAxisLabel(panel, myDate, x0, color, null, true);
					this.stx.startClip(panel.name);
				}
			}
			if(this.highlighted){
				var p0Fill=this.highlighted=="p0"?true:false;
				this.littleCircle(context, x0, y0, p0Fill);
			}

		}
	}, true);


	/**
	 * Speed Resistance Arc drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.segment}
	 * @constructor
	 * @name  CIQ.Drawing.speedarc
	 * @since 2016-09-19
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.speedarc=function(){
		this.name="speedarc";
		this.printLevels=true;
	};
	CIQ.Drawing.speedarc.ciqInheritsFrom(CIQ.Drawing.segment);
	CIQ.extend(CIQ.Drawing.speedarc.prototype,{
		defaultOpacity: 0.25,
		configs: ["color","fillColor","lineWidth","pattern"],
		copyConfig: function(){
			this.color=this.stx.currentVectorParameters.currentColor;
			this.fillColor=this.stx.currentVectorParameters.fillColor;
			this.lineWidth=this.stx.currentVectorParameters.lineWidth;
			this.pattern=this.stx.currentVectorParameters.pattern;
		},
		intersected: function(tick, value, box){
			if(!this.p0 || !this.p1) return null; // in case invalid drawing (such as from panel that no longer exists)
				var pointsToCheck={0:this.p0, 1:this.p1};
			for(var pt in pointsToCheck){
				if(this.pointIntersection(pointsToCheck[pt][0], pointsToCheck[pt][1], box)){
					this.highlighted="p"+pt;
					return {
						action: "drag",
						point: "p"+pt
					};	
				}
			}
			var isIntersected=this.lineIntersection(tick, value, box, this.name);
			if(isIntersected){
				this.highlighted=true;
				// This object will be used for repositioning
				return {
					action: "move",
					p0: CIQ.clone(this.p0),
					p1: CIQ.clone(this.p1),
					tick: tick, // save original tick
					value: value // save original value
				};
			}
			
			// Just test the box circumscribing the arcs
			var left=this.p1[0]-(this.p0[0]-this.p1[0]);
			var right=this.p0[0];
			var bottom=this.p1[1];
			var top=this.p0[1];

			if(tick>Math.max(left, right) || tick<Math.min(left, right)) return null;
			if(value>Math.max(top, bottom) || value<Math.min(top, bottom)) return null;
			this.highlighted=true;
			return {
				action: "move",
				p0: CIQ.clone(this.p0),
				p1: CIQ.clone(this.p1),
				tick: tick,
				value: value
			};
		},
		render: function(context){
			var panel=this.stx.panels[this.panelName];
			if(!panel) return;
			if(!this.p1) return;
			var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
			var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
			var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
			var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
			var isUpTrend=y1<y0;
			var factor=Math.abs((y1-y0)/(x1-x0));

			var color=this.setLineColor();
			context.strokeStyle=color;
			var fillColor=this.fillColor;
			if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.stx.defaultColor;
			context.fillStyle=fillColor;
			if(context.setLineDash){
				context.setLineDash(CIQ.borderPatternToArray(this.lineWidth,this.pattern));
				context.lineDashOffset=0;  //start point in array
			}
			this.stx.canvasFont("stx_yaxis", context);
			for(var i=1;i<3;i++){
				var radius=Math.abs(this.p1[1]-this.p0[1])*Math.sqrt(2)*i/3;
				var value=this.p1[1]+radius*(isUpTrend?-1:1);
				var y=this.stx.pixelFromValueAdjusted(panel, this.p0[0], value);

				context.save();
				context.beginPath();
				context.scale(1/factor,1);
				context.arc(x1*factor, y1, Math.abs(y-y1), 0, Math.PI, !isUpTrend);
				context.globalAlpha=this.highlighted?1:this.defaultOpacity;
				if(this.pattern!="none") context.stroke();
				context.globalAlpha=0.1;
				context.fill();
				context.restore();
				context.globalAlpha=1;
				if(this.printLevels){
					context.fillStyle=color;
					context.textAlign="center";
					var txt=i+"/3";
					context.fillText(txt, x1, Math.round(y-5));
					context.fillStyle=fillColor;
				}
			}
			context.textAlign="left";
			var parameters={
					pattern: this.pattern,
					lineWidth: this.lineWidth,
					opacity: this.highlighted?1:this.defaultOpacity
			};
			this.stx.plotLine(x0, x1, y0, y1, color, "segment", context, panel, parameters);
			if(context.setLineDash) context.setLineDash([]);
			if(this.highlighted){
				var p0Fill=this.highlighted=="p0"?true:false;
				var p1Fill=this.highlighted=="p1"?true:false;
				this.littleCircle(context, x0, y0, p0Fill);
				this.littleCircle(context, x1, y1, p1Fill);
			}
		},
		reconstruct: function(stx, obj){
			this.stx=stx;
			this.color=obj.col;
			this.fillColor=obj.fc;
			this.panelName=obj.pnl;
			this.pattern=obj.ptrn;
			this.lineWidth=obj.lw;
			this.d0=obj.d0;
			this.d1=obj.d1;
			this.tzo0=obj.tzo0;
			this.tzo1=obj.tzo1;
			this.v0=obj.v0;
			this.v1=obj.v1;
			this.adjust();
		},
		serialize: function(){
			return {
				name:this.name,
				pnl: this.panelName,
				col:this.color,
				fc:this.fillColor,
				ptrn:this.pattern,
				lw:this.lineWidth,
				d0:this.d0,
				d1:this.d1,
				tzo0: this.tzo0,
				tzo1: this.tzo1,
				v0:this.v0,
				v1:this.v1
			};
		}
	}, true);

	/**
	 * Speed Resistance Lines drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.speedarc}
	 * @constructor
	 * @name  CIQ.Drawing.speedline
	 * @since 2016-09-19
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.speedline=function(){
		this.name="speedline";
		this.printLevels=true;
	};
	CIQ.Drawing.speedline.ciqInheritsFrom(CIQ.Drawing.speedarc);
	CIQ.extend(CIQ.Drawing.speedline.prototype,{
		intersected: function(tick, value, box){
			var p0=this.p0, p1=this.p1;
			if(!p0 || !p1) return null; // in case invalid drawing (such as from panel that no longer exists)
			var pointsToCheck={0:p0, 1:p1};
			for(var pt in pointsToCheck){
				if(this.pointIntersection(pointsToCheck[pt][0], pointsToCheck[pt][1], box)){
					this.highlighted="p"+pt;
					return {
						action: "drag",
						point: "p"+pt
					};	
				}
			}
			var rays=this.rays;
			for(var i=0; i<rays.length; i++){
				if(this.lineIntersection(tick, value, box, "ray", rays[i][0], rays[i][1], true)){
					this.highlighted=true;
					// This object will be used for repositioning
					return {
						action: "move",
						p0: CIQ.clone(p0),
						p1: CIQ.clone(p1),
						tick: tick, // save original tick
						value: value // save original value
					};
				}
			}
			return null;
		},
		render: function(context){
			var panel=this.stx.panels[this.panelName];
			if(!panel) return;
			if(!this.p1) return;
			var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
			var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
			var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
			var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
			this.stx.canvasFont("stx_yaxis", context); // match font from y axis so it looks cohesive
			var trendLineColor=this.setLineColor();
			var color=this.color;
			if(color=="auto" || CIQ.isTransparent(color)) color=this.stx.defaultColor;
			context.strokeStyle=color;
			var fillColor=this.fillColor;
			if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.stx.defaultColor;
			context.fillStyle=fillColor;
			var parameters={
					pattern: this.pattern,
					lineWidth: this.lineWidth,
					opacity: this.highlighted?1:this.defaultOpacity
			};
			var farX0,farY0;
			var levels=["1", "2/3", "1/3", "3/2", "3"];
			var levelValues=[1, 2/3, 1/3, 3/2, 3];
			var grids=[];
			this.rays=[];
			for(var i=0;i<levelValues.length;i++){
				var level=levelValues[i];
				if(level>1 && !this.extension) continue;
				var y=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]-(this.p0[1]-this.p1[1])*level);
				var x;
				if(level>1){
					x=CIQ.xIntersection({x0:x0,x1:x1,y0:y0,y1:y}, y1);
					grids.push(x);
				}else{
					x=CIQ.xIntersection({x0:x1,x1:x1,y0:y0,y1:y1}, y);
					grids.push(y);
				}
				//var x=x0+(x1-x0)/level;
				//var y=y0-level*(y0-y1);
				var farX=level>1?x:x1;
				var farY=level>1?y1:y;
				if(!this.confineToGrid){
					farX=panel.left;
					if(x1>x0) farX+=panel.width;
					farY=(farX-x0)*(y-y0)/(x1-x0)+y0;
				}
				if(this.printLevels){
					if(level!=1 || this.extension){
						context.fillStyle=color;
						var perturbX=0,perturbY=0;
						if(y0>y1) {perturbY=-5;context.textBaseline="bottom";}
						else {perturbY=5;context.textBaseline="top";}
						if(x0>x1) {perturbX=5;context.textAlign="right";}
						else {perturbX=-5;context.textAlign="left";}
						if(level>1) context.fillText(levels[i], x+(this.confineToGrid?0:perturbX), y1);
						else context.fillText(levels[i], x1, y+(this.confineToGrid?0:perturbY));
						context.fillStyle=fillColor;
					}
				}
				this.stx.plotLine(x0, farX, y0, farY, (this.highlighted?trendLineColor:color), "segment", context, panel, parameters);
				if(level==1){
					farX0=farX;
					farY0=farY;
				}
				this.rays.push([[x0,y0],[farX,farY]]);
				context.globalAlpha=0.1;
				context.beginPath();
				context.moveTo(farX,farY);
				context.lineTo(x0,y0);
				context.lineTo(farX0,farY0);
				context.fill();
				context.globalAlpha=1;
			}
			context.textAlign="left";
			context.textBaseline="middle";
			if(this.confineToGrid){
				context.globalAlpha=0.3;
				context.beginPath();
				context.strokeRect(x0,y0,x1-x0,y1-y0);
				context.moveTo(x0,grids[1]);
				context.lineTo(x1,grids[1]);
				context.moveTo(x0,grids[2]);
				context.lineTo(x1,grids[2]);
				if(this.extension){
					context.moveTo(grids[3],y0);
					context.lineTo(grids[3],y1);
					context.moveTo(grids[4],y0);
					context.lineTo(grids[4],y1);
				}
				context.stroke();
				context.globalAlpha=1;
			}
			if(this.highlighted){
				var p0Fill=this.highlighted=="p0"?true:false;
				var p1Fill=this.highlighted=="p1"?true:false;
				this.littleCircle(context, x0, y0, p0Fill);
				this.littleCircle(context, x1, y1, p1Fill);
			}
		}
	}, true);

	/**
	 * Gann Fan drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.speedarc}
	 * @constructor
	 * @name  CIQ.Drawing.gannfan
	 * @since 2016-09-19
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.gannfan=function(){
		this.name="gannfan";
		this.printLevels=true;
	};
	CIQ.Drawing.gannfan.ciqInheritsFrom(CIQ.Drawing.speedline);
	CIQ.extend(CIQ.Drawing.gannfan.prototype,{
		render: function(context){
			var panel=this.stx.panels[this.panelName];
			if(!panel) return;
			if(!this.p1) return;
			var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
			var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
			var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
			var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
			this.stx.canvasFont("stx_yaxis", context); // match font from y axis so it looks cohesive
			var trendLineColor=this.setLineColor();
			var color=this.color;
			if(color=="auto" || CIQ.isTransparent(color)) color=this.stx.defaultColor;
			context.strokeStyle=color;
			var fillColor=this.fillColor;
			if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.stx.defaultColor;
			context.fillStyle=fillColor;
			var parameters={
					pattern: this.pattern,
					lineWidth: this.lineWidth,
					opacity: this.highlighted?1:this.defaultOpacity
			};
			var farX0,farY0;
			var levels=[1,2,3,4,8,1/2,1/3,1/4,1/8];
			this.rays=[];
			for(var i=0;i<levels.length;i++){
				var level=levels[i];
				var x=x0+(x1-x0)/level;
				var y=y0-level*(y0-y1);
				var farX=panel.left;
				if(x1>x0) farX+=panel.width;
				var farY=(farX-x0)*(y-y0)/(x1-x0)+y0;
				if(this.printLevels){
					context.fillStyle=color;
					var perturbX=0,perturbY=0;
					if(y0>y1) {perturbY=5;context.textBaseline="top";}
					else {perturbY=-5;context.textBaseline="bottom";}
					if(x0>x1) {perturbX=5;context.textAlign="left";}
					else {perturbX=-5;context.textAlign="right";}
					if(level>1) {
						context.fillText(level+"x1", x+perturbX, y1);
					}
					else {
						context.fillText("1x"+1/level, x1, y+perturbY);
					}
					context.fillStyle=fillColor;
				}
				this.stx.plotLine(x0, farX, y0, farY, this.highlighted?trendLineColor:color, "segment", context, panel, parameters);
				this.rays.push([[x0,y0],[farX,farY]]);
				if(level==1){
					farX0=farX;
					farY0=farY;
				}
				context.globalAlpha=0.1;
				context.beginPath();
				context.moveTo(farX,farY);
				context.lineTo(x0,y0);
				context.lineTo(farX0,farY0);
				context.fill();
				context.globalAlpha=1;
			}
			context.textAlign="left";
			context.textBaseline="middle";
			if(this.highlighted){
				var p0Fill=this.highlighted=="p0"?true:false;
				var p1Fill=this.highlighted=="p1"?true:false;
				this.littleCircle(context, x0, y0, p0Fill);
				this.littleCircle(context, x1, y1, p1Fill);
			}
		}
	}, true);

	/**
	 * Time Cycle drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.speedarc}
	 * @constructor
	 * @name  CIQ.Drawing.timecycle
	 * @since 2016-09-19
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.timecycle=function(){
		this.name="timecycle";
		this.printLevels=true;
	};
	CIQ.Drawing.timecycle.ciqInheritsFrom(CIQ.Drawing.speedarc);
	CIQ.extend(CIQ.Drawing.timecycle.prototype,{
		intersected: function(tick, value, box){
			var p0=this.p0, p1=this.p1, panel=this.stx.panels[this.panelName];
			if(!p0 || !p1 || !panel) return null; // in case invalid drawing (such as from panel that no longer exists)
			var pointsToCheck={0:p0, 1:p1};
			for(var pt in pointsToCheck){
				if(this.pointIntersection(pointsToCheck[pt][0], pointsToCheck[pt][1], box)){
					this.highlighted="p"+pt;
					return {
						action: "drag",
						point: "p"+pt
					};	
				}
			}
			// Check for over the trend line or the 0 vertical line
			var trendIntersects=this.lineIntersection(tick, value, box, "segment");
			if(trendIntersects || (box.x0<=this.p0[0] && box.x1>=p0[0])){
				this.highlighted=true;
				return {
					action: "move",
					p0: CIQ.clone(p0),
					p1: CIQ.clone(p1),
					tick: tick, // save original tick
					value: value // save original value
				};
			}
			return null;
		},
		render: function(context){
			var panel=this.stx.panels[this.panelName];
			if(!panel) return;
			if(!this.p1) return;

			var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
			var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
			var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
			var y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);
			var count=0;

			var trendLineColor=this.setLineColor();
			context.textBaseline="middle";
			this.stx.canvasFont("stx_yaxis", context); // match font from y axis so it looks cohesive
			var h=20;// give it extra space so it does not overlap with the date labels.
			var mult=this.p1[0]-this.p0[0];
			context.textAlign="center";

			var x=x0;
			var top=panel.yAxis.top;
			var farY=panel.yAxis.bottom;
			var color=this.color;
			if(color=="auto" || CIQ.isTransparent(color)) color=this.stx.defaultColor;
			var fillColor=this.fillColor;
			if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.stx.defaultColor;

			if(this.printLevels) farY-=h-7;

			var parameters={
					pattern: this.pattern,
					lineWidth: this.lineWidth,
					opacity: this.highlighted?1:this.defaultOpacity
			};

			var x_s=[];
			context.save();
			context.fillStyle=fillColor;
			context.globalAlpha=0.05;
			//context.globalCompositeOperation="destination-over";
			do{
				x=this.stx.pixelFromTick(this.p0[0]+count*mult, panel.chart);
				count++;

				if(x0<x1 && x>panel.left+panel.width) break;

				else if(x0>x1 && x<panel.left) break;
				else if(x<panel.left || x>panel.left+panel.width) continue;

				context.beginPath();
				context.moveTo(x0,top);
				context.lineTo(x,top);
				context.lineTo(x,farY);
				context.lineTo(x0,farY);
				context.fill();
				x_s.push({c:count,x:x});
			}while(mult);
			context.globalAlpha=1;
			var slack=0;
			for(var pt=0;pt<x_s.length;pt++){
				this.stx.plotLine(x_s[pt].x, x_s[pt].x, 0, farY, this.highlighted?trendLineColor:color, "segment", context, panel, parameters);
				if(this.printLevels){
					context.fillStyle=color;
					var m=this.stx.chart.context.measureText(x_s[pt].c).width+3;
					if(m<this.stx.layout.candleWidth+slack){
						context.fillText(x_s[pt].c, x_s[pt].x, farY+7);
						slack=0;
					}else{
						slack+=this.stx.layout.candleWidth;
					}
				}
			}
			context.restore();
			context.textAlign="left";

			this.stx.plotLine(x0, x1, y0, y1, trendLineColor, "segment", context, panel, parameters);
			if(this.highlighted){
				var p0Fill=this.highlighted=="p0"?true:false;
				var p1Fill=this.highlighted=="p1"?true:false;
				this.littleCircle(context, x0, y0, p0Fill);
				this.littleCircle(context, x1, y1, p1Fill);
			}else{
				// move points so always accessible
				var yVal=this.stx.valueFromPixel(panel.height/2,panel);
				this.setPoint(0, this.p0[0], yVal, panel.chart);
				this.setPoint(1, this.p1[0], yVal, panel.chart);
			}
		}
	}, true);

	/**
	 * Regression Line drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.segment}
	 * @constructor
	 * @name  CIQ.Drawing.regression
	 * @since 2016-09-19
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.regression=function(){
		this.name="regression";
	};
	CIQ.Drawing.regression.ciqInheritsFrom(CIQ.Drawing.segment);
	CIQ.extend(CIQ.Drawing.regression.prototype,{
		chartsOnly: true,
		click: function(context, tick, value){
			if(tick<0) return;
			this.copyConfig();
			var panel=this.stx.panels[this.panelName];
			if(!this.penDown){
				this.setPoint(0, tick, value, panel.chart);
				this.penDown=true;
				return false;
			}
			if(this.accidentalClick(tick, value)) return this.dragToDraw;

			this.setPoint(1, tick, value, panel.chart);
			this.penDown=false;
			return true;	// kernel will call render after this
		},
		render: function(context){
			var panel=this.stx.panels[this.panelName];
			if(!panel) return;
			if(!this.p1) return;
			if(this.p0[0]<0 || this.p1[0]<0) return;
			var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
			var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
			if(x0<panel.left && x1<panel.left) return;
			if(x0>panel.right && x1>panel.right) return;

			var prices=[];
			var sumCloses=0;
			var sumWeightedCloses=0;
			//var sumClosesSquared=0;
			var rawTicks=0;
		    for(var i=Math.min(this.p1[0],this.p0[0]);i<=Math.max(this.p1[0],this.p0[0]);i++){
		    	if(this.stx.chart.dataSet[i]){
		    		var price=this.stx.chart.dataSet[i].Close;
		    		if(price || price===0){
		    			prices.push(price);
		    		}
		    	}
		    	rawTicks++;
		    }
		    for(i=0;i<prices.length;i++){
		    	sumWeightedCloses+=prices.length*prices[i]-sumCloses;
		    	sumCloses+=prices[i];
		    	//sumClosesSquared+=Math.pow(prices[i],2);
		    }
		    var ticks=prices.length;
			var sumWeights=ticks*(ticks+1)/2;
			var squaredSumWeights=Math.pow(sumWeights,2);
			var sumWeightsSquared=sumWeights*(2*ticks+1)/3;
		    var slope=(ticks*sumWeightedCloses-sumWeights*sumCloses)/(ticks*sumWeightsSquared-squaredSumWeights);
		    var intercept=(sumCloses-slope*sumWeights)/ticks;
			var y0,y1;
			if(this.p0[0]<this.p1[0]) {
				y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], intercept);
				y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], slope*rawTicks+intercept);
			}else{
				y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], slope*rawTicks+intercept);
				y1=this.stx.pixelFromValueAdjusted(panel, this.p1[0], intercept);
			}

			var trendLineColor=this.setLineColor();

			var parameters={
					pattern: this.pattern,
					lineWidth: this.lineWidth
			};
			this.stx.plotLine(x0, x1, y0, y1, trendLineColor, "segment", context, panel, parameters);
			this.stx.plotLine(x0, x0, y0-20, y0+20, trendLineColor, "segment", context, panel, parameters);
			this.stx.plotLine(x1, x1, y1-20, y1+20, trendLineColor, "segment", context, panel, parameters);


			if(!this.highlighted){
				//move points
				if(this.p0[0]<this.p1[0]) {
					this.setPoint(0, this.p0[0], intercept, panel.chart);
					this.setPoint(1, this.p1[0], slope*rawTicks+intercept, panel.chart);
				}else{
					this.setPoint(0, this.p0[0], slope*rawTicks+intercept, panel.chart);
					this.setPoint(1, this.p1[0], intercept, panel.chart);
				}
			}else{
				var p0Fill=this.highlighted=="p0"?true:false;
				var p1Fill=this.highlighted=="p1"?true:false;
				this.littleCircle(context, x0, y0, p0Fill);
				this.littleCircle(context, x1, y1, p1Fill);
			}
		}
	}, true);

	/**
	 * trendline is an implementation of a {@link CIQ.Drawing.segment} drawing.
	 *
	 * Extends {@link CIQ.Drawing.segment} and automatically renders a {@link CIQ.Drawing.callout}
	 * containing trend information.
	 * @constructor
	 * @name CIQ.Drawing.trendline
	 * @since 5.1.2
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.trendline=function(){
		this.name="trendline";
	};

	CIQ.Drawing.trendline.ciqInheritsFrom(CIQ.Drawing.segment);

	// allow configuration of font for trendline info in callout, which is then assigned later
	CIQ.Drawing.trendline.prototype.configs=["color","fillColor","lineWidth","pattern","font"];

	CIQ.Drawing.trendline.prototype.measure=function(){
		// empty function since the text will now display in a callout
	};

	CIQ.Drawing.trendline.prototype.reconstruct=function(stx, obj){
		// reconstruct segment as usual, then add callout as property
		CIQ.Drawing.segment.prototype.reconstruct.call(this, stx, obj);
		this.callout = new CIQ.Drawing.callout();
		this.callout.reconstruct(stx, obj.callout);
	};

	CIQ.Drawing.trendline.prototype.serialize=function(){
		// serialize segment as usual, then add callout as property
		var obj=CIQ.Drawing.segment.prototype.serialize.call(this);
		obj.callout=this.callout.serialize();
		return obj;
	};

	CIQ.Drawing.trendline.prototype.render=function(context) {

		var panel = this.stx.panels[this.panelName];
		if (!panel) return;

		// render segment as usual
		CIQ.Drawing.segment.prototype.render.call(this, context);

		// only create and initialize callout once
		if (!this.callout) {
			this.callout = new CIQ.Drawing.callout();
			var obj=CIQ.Drawing.segment.prototype.serialize.call(this);
			this.callout.reconstruct(this.stx, obj);
		}

		// always render the callout perpendicular above / below the segment / trendline
		this.callout.p0 = CIQ.clone(this.p0);

		// extract segment coordinates
		var x0 = this.stx.pixelFromTick(this.p0[0], panel.chart);
		var x1 = this.stx.pixelFromTick(this.p1[0], panel.chart);
		var y0 = this.stx.pixelFromValueAdjusted(panel, this.p0[0], this.p0[1]);
		var y1 = this.stx.pixelFromValueAdjusted(panel, this.p1[0], this.p1[1]);

		// return if we are off the screen axes else insanity ensues
		if(!isFinite(y0) || !isFinite(y1)) return;

		// calculate midpoint (for stem of callout)
		var xmid = (x0 + x1) / 2;
		var ymid = (y0 + y1) / 2;

		// determine length of segment and multiplier / direction of normal vector to give fixed length depending on stem location
		this.fontSize = CIQ.stripPX((this.font && this.font.size) || 13);
		var stemDist = this.callout.w * 1.2 + ((this.callout.stemEntry[0]=='c') ? 0 : 50);
		var segmentDist = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2));
		var scalar = (stemDist / (segmentDist || stemDist)) * ((this.p1[1] < this.p0[1]) ? 1 : -1);

		// normal vector (see e.g. http://mathworld.wolfram.com/NormalVector.html)
		var nX = -(y1 - ymid) * scalar + xmid;
		var nY = (x1 - xmid) * scalar + ymid;

		// assign callout coordinates
		this.callout.p0[0] = this.stx.tickFromPixel(nX, panel.chart);
		this.callout.p0[1] = this.stx.priceFromPixel(nY, panel);
		this.callout.v0 = this.callout.p0[1];
		this.callout.p1 = CIQ.clone(this.p0);

		// assign callout properties
		this.callout.stx = this.stx;
		this.callout.fillColor = this.fillColor || this.callout.fillColor;
		this.callout.borderColor = this.color;
		this.callout.font = this.font || this.callout.font;
		this.callout.noHandles=true;

		// calculate trend and assign to callout text; only show percent if not Inf
		var deltaV = (this.p1[1] - this.p0[1]);
		this.callout.text = '' + Number(deltaV).toFixed(2) +
			(this.p0[1] === 0 ? '' :  ' (' + Number(100 * deltaV / this.p0[1]).toFixed(2) + '%) ') +
			'' + Math.abs(this.p1[0] - this.p0[0]) + ' Bars';

		// calculate stem as midpoint of segment
		var midtickIdx = Math.floor((this.p0[0] + this.p1[0]) / 2), midV;
		if(Math.abs(this.p0[0] - this.p1[0]) > 1 && Math.abs(this.p0[0] - this.p1[0]) < 20) {
			// because of math.floor, we may be grabbing a bar off of center,
			// so calculate price based on slope of trendline
			var midtickXpixel = this.stx.pixelFromTick(midtickIdx, panel.chart);
			var midtickYpixel = y0 + (y1-y0)/(x1-x0) * (midtickXpixel - x0);
			midV = this.stx.priceFromPixel(midtickYpixel, panel) || ymid;
		} else {
			midV = this.stx.priceFromPixel(ymid, panel);
		}

		this.callout.stem = {
			t: midtickIdx,
			v: midV
		};

		// render callout and text
		this.callout.renderText();
		this.callout.render(context);

		// paint the handle circles based on highlighting
		if(this.highlighted){
			var p0Fill=this.highlighted=="p0"?true:false;
			var p1Fill=this.highlighted=="p1"?true:false;
			this.littleCircle(context, x0, y0, p0Fill);
			this.littleCircle(context, x1, y1, p1Fill);
		}

	};

	CIQ.Drawing.trendline.prototype.lineIntersection=function(tick, value, box, type){
		// override type as segment to preserve lineIntersection functionality
		return CIQ.Drawing.BaseTwoPoint.prototype.lineIntersection.call(this, tick, value, box, "segment");
	};


	CIQ.Drawing.trendline.prototype.intersected=function(tick, value, box) {

		// in case invalid drawing (such as from panel that no longer exists)
		if(!this.p0 || !this.p1) return null;

		// call and store intersection methods on both callout and segment
		var calloutIntersected = this.callout.intersected(tick, value, box);
		var segmentIntersected = CIQ.Drawing.segment.prototype.intersected.call(this, tick, value, box);

		// synchronize highlighting
		this.callout.highlighted = !!(calloutIntersected || segmentIntersected);
		//this.highlighted = segmentIntersected || calloutIntersected;

		if(segmentIntersected) {
			// If segment is highlighted, return as usual;
			return segmentIntersected;
		} else if (calloutIntersected) {
			// Otherwise, if callout is highlighted, move segment (callout will follow / rerender)
			return {
				action: "move",
				p0: CIQ.clone(this.p0),
				p1: CIQ.clone(this.p1),
				tick: tick, // save original tick
				value: value // save original value
			};
		}

		// neither are intersected
		return null;
	};

	/**
	 * Average Line drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.regression}
	 * @constructor
	 * @name  CIQ.Drawing.average
	 * @since 4.0.0
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.average=function(){
		this.name="average";
	};
	CIQ.Drawing.average.ciqInheritsFrom(CIQ.Drawing.regression);
	CIQ.extend(CIQ.Drawing.average.prototype,{
		configs: [
			// average line:
			"color", "lineWidth", "pattern", "axisLabel",
			// deviation 1:
			"active1", "color1", "lineWidth1", "pattern1",
			// deviation 2:
			"active2", "color2", "lineWidth2", "pattern2",
			// deviation 3:
			"active3", "color3", "lineWidth3", "pattern3"
		],
		copyConfig: function(withPreferences) {
			CIQ.Drawing.copyConfig(this,withPreferences);
			var cvp = this.stx.currentVectorParameters;
			this.deviation1 = !!cvp.active1;
			this.deviation2 = !!cvp.active2;
			this.deviation3 = !!cvp.active3;
			this.color1 = cvp.color1 || "auto";
			this.color2 = cvp.color2 || "auto";
			this.color3 = cvp.color3 || "auto";
			this.lineWidth1 = cvp.lineWidth1;
			this.lineWidth2 = cvp.lineWidth2;
			this.lineWidth3 = cvp.lineWidth3;
			this.pattern1 = cvp.pattern1;
			this.pattern2 = cvp.pattern2;
			this.pattern3 = cvp.pattern3;
		},
		$controls: [
			'cq-cvp-controller[cq-cvp-header="1"]',
			'cq-cvp-controller[cq-cvp-header="2"]',
			'cq-cvp-controller[cq-cvp-header="3"]'
		],
		measure: function() {
			if (this.p0 && this.p1) {
				this.stx.setMeasure(this.p0[1], false, this.p0[0], this.p1[0], true, this.name);
				var txt = [];
				if (this.deviation1) txt.push("1");
				if (this.deviation2) txt.push("2");
				if (this.deviation3) txt.push("3");
				if (txt.length === 0) return;
				var html = "&ensp;" + txt.join(", ") + " &sigma;";
				var mMeasure = $$$(".mMeasure", this.stx.chart.drawingContainer);
				var mSticky = this.stx.controls.mSticky;
				var mStickyInterior = mSticky && $$$(".mStickyInterior", mSticky);
				if (mMeasure) mMeasure.innerHTML += html;
				if (mStickyInterior) mStickyInterior.innerHTML += html;
			}
		},
		render: function(context){
			var panel=this.stx.panels[this.panelName];
			if(!panel) return;
			if(!this.p1) return;
			if(this.p0[0]<0 || this.p1[0]<0) return;
			var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
			var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
			if(x0<panel.left && x1<panel.left) return;
			if(x0>panel.right && x1>panel.right) return;

			var stx = this.stx;
			var dataSet = stx.chart.dataSet;
			var start = Math.min(this.p1[0], this.p0[0]);
			var end = Math.max(this.p1[0], this.p0[0]);
			var sumCloses=0;
			var rawTicks=0;
			var validTicks=0;
			var i, price;

			for(i = start; i <= end; i++){
				rawTicks++;
				if (!dataSet[i]) continue;

				price = dataSet[i].Close;
				if(price || price===0){
					validTicks++;
					sumCloses+=price;
				}
			}

			if(!validTicks) return;

			var average=sumCloses/validTicks;
			var sumDeviations = 0;

			for (i = start; i <= end; i++) {
				if (!dataSet[i]) continue;
				price = dataSet[i].Close;
				if (price || price === 0) {
					sumDeviations += Math.pow(price - average, 2);
				}
			}

			var deviation = Math.sqrt(sumDeviations / validTicks);
			var lines = {};
			var color, label;

			if (this.deviation1) {
				color = this.setLineColor(this.color1);
				label = "1\u03c3";
				lines.deviation1p = {
					value: average + deviation,
					color: color,
					label: label,
					params: {
						pattern: this.pattern1,
						lineWidth: this.lineWidth1
					}
				};
				lines.deviation1n = {
					value: average + deviation * -1,
					color: color,
					label: label,
					params: {
						pattern: this.pattern1,
						lineWidth: this.lineWidth1
					}
				};
			}
			if (this.deviation2) {
				color = this.setLineColor(this.color2);
				label = "2\u03c3";
				lines.deviation2p = {
					value: average + deviation * 2,
					color: color,
					label: label,
					params: {
						pattern: this.pattern2,
						lineWidth: this.lineWidth2
					}
				};
				lines.deviation2n = {
					value: average + deviation * -2,
					color: color,
					label: label,
					params: {
						pattern: this.pattern2,
						lineWidth: this.lineWidth2
					}
				};
			}
			if (this.deviation3) {
				color = this.setLineColor(this.color3);
				label = "3\u03c3";
				lines.deviation3p = {
					value: average + deviation * 3,
					label: label,
					color: color,
					params: {
						pattern: this.pattern3,
						lineWidth: this.lineWidth3
					}
				};
				lines.deviation3n = {
					value: average + deviation * -3,
					color: color,
					label: label,
					params: {
						pattern: this.pattern3,
						lineWidth: this.lineWidth3
					}
				};
			}

			// intentionally setting average last so `y` will be the average pixel after the loop below exits
			lines.average = {
				value: average,
				color: this.setLineColor(),
				params: {
					pattern: this.pattern,
					lineWidth: this.lineWidth
				}
			};

			var line, y, tailpx, txt;
			this.intersections = [];

			function formatPrice(price){
				if(panel.yAxis.priceFormatter)
					price=panel.yAxis.priceFormatter(stx, panel, price);
				else
					price=stx.formatYAxisPrice(price, panel);
				return price;
			}

			for (var key in lines) {
				line = lines[key];
				this.intersections.push(line.value);
				y = stx.pixelFromValueAdjusted(panel, this.p0[0], line.value);
				tailpx = key === "average" ? 20 : 10;

				stx.plotLine(x0, x1, y, y, line.color, "segment", context, panel, line.params);
				stx.plotLine(x0, x0, y-tailpx, y+tailpx, line.color, "segment", context, panel, line.params);
				stx.plotLine(x1, x1, y-tailpx, y+tailpx, line.color, "segment", context, panel, line.params);

				// print the values on the canvas
				if(line.label){
					context.fillStyle=line.color;
					context.save();
					context.textBaseline="middle";
					//context.fillText(formatPrice(line.value), Math.max(x0,x1)+5, y);
					context.fillText(line.label, Math.max(x0,x1)+5, y);
					context.restore();
				}

				if(this.axisLabel && !this.highlighted && !this.penDown){
					if((x0>=panel.chart.left && x0<=panel.chart.right) || (x1>=panel.chart.left && x1<=panel.chart.right)){
						stx.endClip();
						txt=line.value;
						if(panel.chart.transformFunc) txt=panel.chart.transformFunc(this.stx, panel.chart, txt);
						stx.createYAxisLabel(panel, formatPrice(txt), y, line.color);
						stx.startClip(panel.name);
					}
				}
			}

			if(!this.highlighted){
				//move points
				this.setPoint(0, this.p0[0], average);
				this.setPoint(1, this.p1[0], average);
			}else{
				var p0Fill=this.highlighted=="p0"?true:false;
				var p1Fill=this.highlighted=="p1"?true:false;
				this.littleCircle(context, x0, y, p0Fill);
				this.littleCircle(context, x1, y, p1Fill);
			}
		},
		reconstruct: function(stx, obj){
			this.stx=stx;
			this.panelName=obj.pnl;
			this.deviation1=obj.dev1;
			this.deviation2=obj.dev2;
			this.deviation3=obj.dev3;
			this.color=obj.col;
			this.color1=obj.col1;
			this.color2=obj.col2;
			this.color3=obj.col3;
			this.pattern=obj.ptrn;
			this.pattern1=obj.ptrn1;
			this.pattern2=obj.ptrn2;
			this.pattern3=obj.ptrn3;
			this.lineWidth=obj.lw;
			this.lineWidth1=obj.lw1;
			this.lineWidth2=obj.lw2;
			this.lineWidth3=obj.lw3;
			this.d0=obj.d0;
			this.d1=obj.d1;
			this.tzo0=obj.tzo0;
			this.tzo1=obj.tzo1;
			this.v0=obj.v0;
			this.v1=obj.v1;
			this.axisLabel=obj.al;
			this.adjust();
		},
		serialize: function(){
			var obj={
				name:this.name,
				pnl: this.panelName,
				dev1:this.deviation1,
				dev2:this.deviation2,
				dev3:this.deviation3,
				col:this.color,
				col1:this.color1,
				col2:this.color2,
				col3:this.color3,
				ptrn:this.pattern,
				ptrn1:this.pattern1,
				ptrn2:this.pattern2,
				ptrn3:this.pattern3,
				lw:this.lineWidth,
				lw1:this.lineWidth1,
				lw2:this.lineWidth2,
				lw3:this.lineWidth3,
				d0:this.d0,
				d1:this.d1,
				tzo0: this.tzo0,
				tzo1: this.tzo1,
				v0:this.v0,
				v1:this.v1,
				al:this.axisLabel
			};
			return obj;
		},
		intersected: function(tick, value, box) {
			var averageLineIntersection = CIQ.Drawing.segment.prototype.intersected.call(this, tick, value, box);

			if (averageLineIntersection) {
				return averageLineIntersection;
			}

			var lineIntersection = CIQ.Drawing.BaseTwoPoint.prototype.lineIntersection;
			var intersections = this.intersections;
			var p0 = [this.p0[0], 0];
			var p1 = [this.p1[0], 0];
			var line = {
				p0: p0,
				p1: p1,
				stx: this.stx,
				panelName: this.panelName
			};

			// the last value is average, which was already checked by `intersected.call` above
			for (var i = 0; intersections && i < intersections.length - 1; ++i) {
				p0[1] = p1[1] = intersections[i];

				if (lineIntersection.call(line, tick, value, box, "segment")) {
					this.highlighted = true;

					return {
						action: "move",
						p0: p0,
						p1: p1,
						tick: tick,
						value: value
					};
				}
			}

			return null;
		}
	}, true);

	/**
	 * Quadrant Lines drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.speedarc}
	 * @constructor
	 * @name  CIQ.Drawing.quadrant
	 * @since 2016-09-19
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.quadrant=function(){
		this.name="quadrant";
	};
	CIQ.Drawing.quadrant.ciqInheritsFrom(CIQ.Drawing.speedarc);
	CIQ.extend(CIQ.Drawing.quadrant.prototype,{
		chartsOnly: true,
		render: function(context){
			var panel=this.stx.panels[this.panelName];
			if(!panel) return;
			if(!this.p1) return;
			var x0=this.stx.pixelFromTick(this.p0[0], panel.chart);
			var x1=this.stx.pixelFromTick(this.p1[0], panel.chart);
			if(x0<panel.left && x1<panel.left) return;
			if(x0>panel.right && x1>panel.right) return;

			var highest=null, lowest=null;
		    for(var i=Math.min(this.p1[0],this.p0[0]);i<=Math.max(this.p1[0],this.p0[0]);i++){
		    	if(this.stx.chart.dataSet[i]){
		    		var price=this.stx.chart.dataSet[i].Close;
		    		if(price || price===0){
		    			if(highest===null || price>highest) highest=price;
		    			if(lowest===null || price<lowest) lowest=price;
		    		}
		    	}
		    }
		    var avg=(highest+lowest)/2;
			var y0=this.stx.pixelFromValueAdjusted(panel, this.p0[0], highest);
			var y25=this.stx.pixelFromValueAdjusted(panel, this.p0[0], (highest+avg)/2);
			var y33=this.stx.pixelFromValueAdjusted(panel, this.p0[0], (2*highest+lowest)/3);
			var y50=this.stx.pixelFromValueAdjusted(panel, this.p0[0], avg);
			var y66=this.stx.pixelFromValueAdjusted(panel, this.p0[0], (highest+2*lowest)/3);
			var y75=this.stx.pixelFromValueAdjusted(panel, this.p0[0], (lowest+avg)/2);
			var y100=this.stx.pixelFromValueAdjusted(panel, this.p0[0], lowest);

			this.highest=highest; this.lowest=lowest;
			var trendLineColor=this.setLineColor();

			var fillColor=this.fillColor;
			if(fillColor=="auto" || CIQ.isTransparent(fillColor)) fillColor=this.stx.defaultColor;
			context.fillStyle=fillColor;

			var parameters={
					pattern: this.pattern,
					lineWidth: this.lineWidth
			};
			this.stx.plotLine(x0, x1, y0, y0, trendLineColor, "segment", context, panel, parameters);
			this.stx.plotLine(x0, x1, y100, y100, trendLineColor, "segment", context, panel, parameters);
			if(this.name=="quadrant"){
				this.stx.plotLine(x0, x1, y25, y25, trendLineColor, "segment", context, panel, parameters);
				this.stx.plotLine(x0, x1, y75, y75, trendLineColor, "segment", context, panel, parameters);
			}else if(this.name=="tirone"){
				this.stx.plotLine(x0, x1, y33, y33, trendLineColor, "segment", context, panel, parameters);
				this.stx.plotLine(x0, x1, y66, y66, trendLineColor, "segment", context, panel, parameters);
			}
			this.stx.plotLine(x0, x0, y0, y100, trendLineColor, "segment", context, panel, parameters);
			this.stx.plotLine(x1, x1, y0, y100, trendLineColor, "segment", context, panel, parameters);
			this.stx.plotLine(x0, x1, y50, y50, trendLineColor, "segment", context, panel, CIQ.extend(parameters,{opacity: this.name=="tirone"?0.2:1}));

			context.globalAlpha=0.1;
			context.beginPath();
			context.fillRect(x0,y0,x1-x0,y100-y0);
			if(this.name=="quadrant"){
				context.fillRect(x0,y25,x1-x0,y75-y25);
			}else if(this.name=="tirone"){
				context.fillRect(x0,y33,x1-x0,y66-y33);
			}
			context.globalAlpha=1;

			if(!this.highlighted){
				//move points
				this.setPoint(0, this.p0[0], avg, panel.chart);
				this.setPoint(1, this.p1[0], avg, panel.chart);
			}else{
				var p0Fill=this.highlighted=="p0"?true:false;
				var p1Fill=this.highlighted=="p1"?true:false;
				this.littleCircle(context, x0, y50, p0Fill);
				this.littleCircle(context, x1, y50, p1Fill);
			}
		},
		boxIntersection: function(tick, value){
			var p0=this.p0, p1=this.p1;
			if(!p0 || !p1) return false;
			if(tick>Math.max(p0[0], p1[0]) || tick<Math.min(p0[0], p1[0])) return false;
			if(!this.stx.repositioningDrawing && (value>this.highest || value<this.lowest)) return false;
			return true;
		},
		intersected: function(tick, value, box){
			var p0=this.p0, p1=this.p1;
			if(!p0 || !p1) return null; // in case invalid drawing (such as from panel that no longer exists)
			var pointsToCheck={0:p0, 1:p1};
			for(var pt in pointsToCheck){
				if(this.pointIntersection(pointsToCheck[pt][0], pointsToCheck[pt][1], box)){
					this.highlighted="p"+pt;
					return {
						action: "drag",
						point: "p"+pt
					};	
				}
			}
			if(this.boxIntersection(tick, value)){
				this.highlighted=true;
				return {
					action: "move",
					p0: CIQ.clone(p0),
					p1: CIQ.clone(p1),
					tick: tick,
					value: value
				};
			}
			return null;
		}
	}, true);

	/**
	 * Tirone Levels drawing tool.
	 *
	 * It inherits its properties from {@link CIQ.Drawing.quadrant}
	 * @constructor
	 * @name  CIQ.Drawing.tirone
	 * @since 2016-09-19
	 * @version ChartIQ Advanced Package
	 */
	CIQ.Drawing.tirone=function(){
		this.name="tirone";
	};
	CIQ.Drawing.tirone.ciqInheritsFrom(CIQ.Drawing.quadrant);


	return _exports;
})/* removeIf(umd) */(typeof window !== 'undefined' ? window : global)/* endRemoveIf(umd) */;